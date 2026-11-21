import React, { useReducer, useEffect, useCallback, useRef } from "react";
import type { Identity } from "@/store/identity";
import { getIdentity, createIdentity, clearIdentity, restoreIdentityIfMissing } from "@/store/identity";
import { hasSeen, markSeen, clearSeen } from "@/store/seenMessages";
import type { Contact } from "@/store/contacts";
import { getContacts, addContactDurable, removeContact as storeRemoveContact, clearContacts, updateContactDurable, restoreContactsIfMissing } from "@/store/contacts";
import type { StoredMessage, DisappearTimer } from "@/store/messages";
import { getMessagesForContact, saveMessage, clearAllMessages, deleteMessagesForContact, purgeExpiredMessages, markMessagesAsRead, markOutgoingAsRead, unwrapStoredMessage } from "@/store/messages";
import type { Group } from "@/store/groups";
import { getGroups, getGroup, createGroup as storeCreateGroup, deleteGroup as storeDeleteGroup, clearGroups } from "@/store/groups";
import { getGroupMessages, saveGroupMessage, deleteGroupMessages, clearAllGroupMessages } from "@/store/groupMessages";
import { importPrivateKey, importPublicKey, deriveSharedKey, base64ToPublicKey, publicKeyToBase64 } from "@/crypto/keys";
import { encryptMessage, decryptMessage } from "@/crypto/encrypt";
import { pinKey } from "@/store/keyPinning";
import { clearPinnedKeys } from "@/store/keyPinning";
import { clearVault, syncVaultFromLocalStorage } from "@/store/vault";
import { lockVault, hasVault } from "@/store/vault";
import { clearSessionUnlock } from "@/store/sessionLock";
import { mirrorPhantomStorageToIDB, restorePhantomStorageFromIDB, clearPhantomStorageFromIDB } from "@/store/appPersist";
import { playIncomingMessageSound } from "@/lib/notificationSound";
import {
  initRatchetAsAlice,
  initRatchetAsBob,
  ratchetEncrypt,
  ratchetDecrypt,
  deriveInitialSharedSecret,
} from "@/crypto/ratchet";
import type { RatchetMessage, RatchetState } from "@/crypto/ratchet";
import { getRatchetState, saveRatchetState, deleteRatchetState, clearAllRatchetStates } from "@/store/ratchetState";
import { incrementSentKeys, incrementReceivedKeys, recordDhRatchet, clearRatchetStats, deleteStatsForContact } from "@/store/ratchetStats";
import {
  publishPublicKey,
  sendRelayMessage,
  fetchPendingMessages,
  fetchPendingMessagesForQueue,
  deleteRelayMessage,
  subscribeToMessages,
  subscribeToQueues,
  unsubscribeFromMessages,
  searchUsers,
  createQueue,
  deleteQueue,
  extractHmacEnvelope,
} from "@/services/relay";
import { deriveHmacKeyFromShared, signPayload, verifyPayload } from "@/crypto/hmac";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  enqueueOutbox,
  listOutbox,
  removeOutbox,
  updateOutbox,
  clearOutbox,
  MAX_ATTEMPTS,
  type OutboxEntry,
} from "@/store/outboxPersist";
import { CryptoContext } from "./cryptoContext";
import type { CryptoState, IncomingMessageHandler } from "./cryptoTypes";

// ─── State ──────────────────────────────────────────────────────────

type CryptoAction =
  | { type: "SET_IDENTITY"; identity: Identity | null }
  | { type: "SET_CONTACTS"; contacts: Contact[] }
  | { type: "SET_GROUPS"; groups: Group[] }
  | { type: "ADD_GROUP"; group: Group }
  | { type: "REMOVE_GROUP"; id: string }
  | { type: "ADD_CONTACT"; contact: Contact }
  | { type: "REMOVE_CONTACT"; id: string }
  | { type: "UPDATE_CONTACT"; id: string; updates: Partial<Contact> }
  | { type: "SET_INITIALIZED" }
  | { type: "SET_DISAPPEAR_TIMER"; timer: DisappearTimer }
  | { type: "SET_RELAY_CONNECTED"; connected: boolean }
  | { type: "SET_RELAY_STATUS"; status: CryptoState["relayStatus"] }
  | { type: "SET_TYPING"; contactId: string; typing: boolean }
  | { type: "SET_OUTBOX_COUNTS"; pending: number; failed: number }
  | { type: "RESET" };

function reducer(state: CryptoState, action: CryptoAction): CryptoState {
  switch (action.type) {
    case "SET_IDENTITY":
      return { ...state, identity: action.identity };
    case "SET_CONTACTS":
      return { ...state, contacts: action.contacts };
    case "SET_GROUPS":
      return { ...state, groups: action.groups };
    case "ADD_GROUP":
      return { ...state, groups: [...state.groups, action.group] };
    case "REMOVE_GROUP":
      return { ...state, groups: state.groups.filter((g) => g.id !== action.id) };
    case "ADD_CONTACT":
      return { ...state, contacts: [...state.contacts, action.contact] };
    case "REMOVE_CONTACT":
      return { ...state, contacts: state.contacts.filter((c) => c.id !== action.id) };
    case "UPDATE_CONTACT":
      return {
        ...state,
        contacts: state.contacts.map((c) =>
          c.id === action.id ? { ...c, ...action.updates } : c
        ),
      };
    case "SET_INITIALIZED":
      return { ...state, initialized: true };
    case "SET_DISAPPEAR_TIMER":
      return { ...state, disappearTimer: action.timer };
    case "SET_RELAY_CONNECTED":
      return { ...state, relayConnected: action.connected };
    case "SET_RELAY_STATUS":
      return { ...state, relayStatus: action.status, relayConnected: action.status === "connected" };
    case "SET_TYPING": {
      const typingContacts = { ...state.typingContacts };
      if (action.typing) {
        typingContacts[action.contactId] = Date.now();
      } else {
        delete typingContacts[action.contactId];
      }
      return { ...state, typingContacts };
    }
    case "SET_OUTBOX_COUNTS":
      return { ...state, outboxPending: action.pending, outboxFailed: action.failed };
    case "RESET":
      return { identity: null, contacts: [], groups: [], initialized: true, disappearTimer: "off", relayConnected: false, relayStatus: "disconnected", typingContacts: {}, outboxPending: 0, outboxFailed: 0 };
    default:
      return state;
  }
}

// ─── Ratchet Helpers ────────────────────────────────────────────────

/**
 * Get or initialize ratchet state for a contact.
 * isInitiator = true means we added them (Alice role).
 */
async function getOrInitRatchet(
  contactId: string,
  myPrivateKey: JsonWebKey,
  myKeyPair: { publicKey: JsonWebKey; privateKey: JsonWebKey },
  peerPublicKey: JsonWebKey,
  isInitiator: boolean
): Promise<RatchetState> {
  const existing = getRatchetState(contactId);
  if (existing) return existing;

  const sharedSecret = await deriveInitialSharedSecret(myPrivateKey, peerPublicKey);

  let state: RatchetState;
  if (isInitiator) {
    state = await initRatchetAsAlice(sharedSecret, peerPublicKey);
  } else {
    state = await initRatchetAsBob(sharedSecret, myKeyPair);
  }

  saveRatchetState(contactId, state);
  return state;
}

/**
 * Determine if we were the initiator (Alice) for a contact.
 * Simple heuristic: compare fingerprints lexicographically.
 * The party with the "smaller" fingerprint is Alice.
 */
function isAliceRole(myFingerprint: string, peerFingerprint: string): boolean {
  return myFingerprint < peerFingerprint;
}

function getHiddenControlType(plaintext: string): "read_receipt" | "typing" | "ratchet_reset" | null {
  try {
    const parsed = JSON.parse(plaintext);
    if (
      parsed?.__type === "read_receipt" ||
      parsed?.__type === "typing" ||
      parsed?.__type === "ratchet_reset"
    ) {
      return parsed.__type;
    }
  } catch {}
  return null;
}

/**
 * Derive an HMAC key for a contact using ECDH shared secret.
 */
async function getHmacKeyForContact(myPrivateJwk: JsonWebKey, peerPublicJwk: JsonWebKey): Promise<CryptoKey> {
  const privKey = await importPrivateKey(myPrivateJwk);
  const pubKey = await importPublicKey(peerPublicJwk);
  const dhBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256
  );
  return deriveHmacKeyFromShared(dhBits);
}

/**
 * Send a one-shot "please wipe your ratchet state for me" control message
 * to a peer over the legacy AES-GCM channel (identity-key ECDH shared key).
 * Used only when our own ratchet decryption has irrecoverably desynced.
 * Caller is responsible for throttling.
 */
async function sendRatchetResetSignal(contact: Contact, identity: Identity): Promise<void> {
  if (!contact.outboxQueueId) return;
  const payloadObj = JSON.stringify({ __type: "ratchet_reset", timestamp: Date.now() });
  const privateKey = await importPrivateKey(identity.keyPair.privateKey);
  const publicKey = await importPublicKey(contact.publicKey);
  const sharedKey = await deriveSharedKey(privateKey, publicKey);
  const encrypted = await encryptMessage(payloadObj, sharedKey);
  const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
  const hmacSig = await signPayload(hmacKey, encrypted.ciphertext);
  await sendRelayMessage(contact.outboxQueueId, encrypted.ciphertext, encrypted.iv, hmacSig);
  console.warn("[ratchet-resync] sent reset signal to", contact.displayName);
}

// ─── Provider ───────────────────────────────────────────────────────

export function CryptoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    identity: null,
    contacts: [],
    groups: [],
    initialized: false,
    disappearTimer: "off",
    relayConnected: false,
    relayStatus: "disconnected",
    typingContacts: {},
    outboxPending: 0,
    outboxFailed: 0,
  });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const queueChannelRef = useRef<RealtimeChannel[] | null>(null);
  const relayReconnectTimerRef = useRef<number | null>(null);
  const relayReconnectAttemptRef = useRef(0);
  const relayTeardownInProgressRef = useRef(false);
  const relayConnectIdRef = useRef(0);
  const incomingHandlersRef = useRef<Set<IncomingMessageHandler>>(new Set());
  // Throttle ratchet-resync signals to at most one per contact per 30s so a
  // bombardment of un-decryptable ratchet messages from a desynced peer
  // doesn't produce a reset-signal storm on the relay.
  const lastResetSentRef = useRef<Record<string, number>>({});
  // Hydration gate — resolves after identity + contacts have been pulled
  // from the encrypted vault / IDB mirror / localStorage on first mount or
  // after unlock. Inbound relay handlers MUST await this before touching
  // contacts or ratchet state, otherwise a fast-arriving message can be
  // dropped (no contact match) or trigger a "missing identity" path even
  // though both exist on disk.
  const hydrationReadyRef = useRef<Promise<void> | null>(null);
  const hydrationResolveRef = useRef<(() => void) | null>(null);
  if (!hydrationReadyRef.current) {
    hydrationReadyRef.current = new Promise<void>((resolve) => {
      hydrationResolveRef.current = resolve;
    });
  }
  const syncVault = useCallback(() => {
    void syncVaultFromLocalStorage().catch((error) => {
      console.error("[vault] sync failed:", error);
    });
    void mirrorPhantomStorageToIDB().catch((error) => {
      console.error("[appPersist] mirror failed:", error);
    });
  }, []);
  const relaySubscriptionKey = state.contacts
    .map((contact) => `${contact.id}:${contact.publicKeyFingerprint}:${contact.inboxQueueId ?? ""}`)
    .join("|");

  const teardownRelaySubscriptions = useCallback(() => {
    relayTeardownInProgressRef.current = true;
    if (relayReconnectTimerRef.current) {
      window.clearTimeout(relayReconnectTimerRef.current);
      relayReconnectTimerRef.current = null;
    }
    if (channelRef.current) {
      unsubscribeFromMessages(channelRef.current);
      channelRef.current = null;
    }
    if (queueChannelRef.current) {
      queueChannelRef.current.forEach((ch) => unsubscribeFromMessages(ch));
      queueChannelRef.current = null;
    }
    window.setTimeout(() => {
      relayTeardownInProgressRef.current = false;
    }, 0);
  }, []);

  const resolveIdentity = useCallback(async () => {
    const identity = state.identity ?? getIdentity() ?? await restoreIdentityIfMissing();
    if (identity && !state.identity) {
      dispatch({ type: "SET_IDENTITY", identity });
    }
    return identity;
  }, [state.identity]);

  const ensureContactQueues = useCallback(async (contact: Contact): Promise<Contact> => {
    const identity = await resolveIdentity();
    if (!identity) return contact;

    const { deriveInboxQueueId, deriveOutboxQueueId } = await import("@/crypto/deriveQueue");
    const inboxQueueId = contact.inboxQueueId ?? await deriveInboxQueueId(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
    const outboxQueueId = contact.outboxQueueId ?? await deriveOutboxQueueId(identity.publicKeyFingerprint, contact.publicKeyFingerprint);

    if (contact.inboxQueueId !== inboxQueueId || contact.outboxQueueId !== outboxQueueId) {
      const updates = { inboxQueueId, outboxQueueId };
      void updateContactDurable(contact.id, updates).catch((error) => {
        console.error("[ensureContactQueues] durable contact update failed:", error);
      });
      dispatch({ type: "UPDATE_CONTACT", id: contact.id, updates });
      syncVault();
    }

    void createQueue(identity.publicKeyFingerprint, inboxQueueId).catch((error) => {
      console.error("[ensureContactQueues] inbox registration failed:", error);
    });

    return { ...contact, inboxQueueId, outboxQueueId };
  }, [resolveIdentity, syncVault]);

  const reloadState = useCallback(async () => {
    // Re-arm hydration gate so any inbound messages that arrive between
    // unlock and full state restoration are held until we're ready.
    hydrationReadyRef.current = new Promise<void>((resolve) => {
      hydrationResolveRef.current = resolve;
    });
    await restorePhantomStorageFromIDB();
    const identity = await restoreIdentityIfMissing();
    const contacts = await restoreContactsIfMissing();
    const savedTimer = (localStorage.getItem("phantom_disappear_timer") as DisappearTimer) || "off";
    dispatch({ type: "SET_IDENTITY", identity });
    dispatch({ type: "SET_CONTACTS", contacts });
    dispatch({ type: "SET_GROUPS", groups: getGroups() });
    dispatch({ type: "SET_DISAPPEAR_TIMER", timer: savedTimer });
    purgeExpiredMessages();
    import("@/crypto/epochKeys").then((m) => m.purgeExpiredEpochKeys()).catch(() => {});
    console.log("[hydrate] reload ready", { hasIdentity: !!identity, contacts: contacts.length });
    hydrationResolveRef.current?.();
  }, []);

  // Initialize identity and contacts. Tries localStorage first, then falls
  // back to the IndexedDB mirror so privacy browsers (DuckDuckGo, Safari
  // Private) that wipe localStorage on close still resume the same account.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await restorePhantomStorageFromIDB();
      const identity = await restoreIdentityIfMissing();
      if (cancelled) return;
      const contacts = await restoreContactsIfMissing();
      const savedTimer = (localStorage.getItem("phantom_disappear_timer") as DisappearTimer) || "off";
      dispatch({ type: "SET_IDENTITY", identity });
      dispatch({ type: "SET_CONTACTS", contacts });
      dispatch({ type: "SET_GROUPS", groups: getGroups() });
      dispatch({ type: "SET_DISAPPEAR_TIMER", timer: savedTimer });
      dispatch({ type: "SET_INITIALIZED" });
      purgeExpiredMessages();
      // Rotate forward-secure local-storage keys; messages older than the retention window become unreadable.
      import("@/crypto/epochKeys").then((m) => m.purgeExpiredEpochKeys()).catch(() => {});
      console.log("[hydrate] ready", { hasIdentity: !!identity, contacts: contacts.length });
      hydrationResolveRef.current?.();
    })();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to real-time relay when identity exists. Re-subscribes after
  // socket/network drops with exponential backoff so PWA resumes keep working.
  useEffect(() => {
    if (!state.identity) {
      teardownRelaySubscriptions();
      dispatch({ type: "SET_RELAY_STATUS", status: "disconnected" });
      return;
    }

    let cancelled = false;
    let expectedChannels = 1;
    const subscribedChannels = new Set<string>();
    const fingerprint = state.identity.publicKeyFingerprint;
    const identity = state.identity;

    const scheduleReconnect = (reason: string) => {
      if (cancelled || relayReconnectTimerRef.current) return;
      teardownRelaySubscriptions();
      if (!navigator.onLine) {
        dispatch({ type: "SET_RELAY_STATUS", status: "disconnected" });
        return;
      }
      relayReconnectAttemptRef.current += 1;
      const delay = Math.min(30000, 1000 * 2 ** Math.min(relayReconnectAttemptRef.current - 1, 5));
      console.warn(`[relay] ${reason}; reconnecting in ${delay}ms`);
      dispatch({ type: "SET_RELAY_STATUS", status: "reconnecting" });
      relayReconnectTimerRef.current = window.setTimeout(() => {
        relayReconnectTimerRef.current = null;
        void connectRelay();
      }, delay);
    };

    const handleChannelStatus = (channelKey: string, status: string, error?: Error) => {
      if (cancelled) return;
      const statusConnectId = Number(channelKey.split(":").pop());
      if (statusConnectId !== relayConnectIdRef.current) return;
      if (relayTeardownInProgressRef.current && status === "CLOSED") return;
      if (status === "SUBSCRIBED") {
        subscribedChannels.add(channelKey);
        if (subscribedChannels.size >= expectedChannels) {
          relayReconnectAttemptRef.current = 0;
          dispatch({ type: "SET_RELAY_STATUS", status: "connected" });
        }
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        subscribedChannels.delete(channelKey);
        if (error) console.error(`[relay] channel ${channelKey} ${status}:`, error);
        scheduleReconnect(status.toLowerCase());
      }
    };

    const connectRelay = async () => {
      if (cancelled) return;
      const connectId = ++relayConnectIdRef.current;
      teardownRelaySubscriptions();
      subscribedChannels.clear();
      dispatch({ type: "SET_RELAY_STATUS", status: relayReconnectAttemptRef.current > 0 ? "reconnecting" : "connecting" });

      publishPublicKey(
        fingerprint,
        identity.displayName,
        identity.keyPair.publicKey
      ).catch(console.error);

      const rawContacts = await restoreContactsIfMissing();
      const contacts = await Promise.all(rawContacts.map((contact) => ensureContactQueues(contact)));
      if (cancelled) return;
      if (state.contacts.length === 0 && contacts.length > 0) {
        dispatch({ type: "SET_CONTACTS", contacts });
      }
      const queueIds = contacts
        .map((c) => c.inboxQueueId)
        .filter((q): q is string => !!q);
      expectedChannels = queueIds.length;

      // ─── Channel identifier validation ────────────────────────────
      // Print the exact identifiers used to build subscriptions so both
      // devices can be compared side-by-side. For each contact we log:
      //   self fp, peer fp, derived inbox (mine), derived outbox (peer's inbox)
      // Device A's inbox MUST equal Device B's outbox (and vice versa) —
      // if they differ, peers are publishing/subscribing to different queues
      // and messages will never be delivered.
      try {
        const { deriveInboxQueueId, deriveOutboxQueueId } = await import("@/crypto/deriveQueue");
        const rows = await Promise.all(contacts.map(async (c) => {
          const derivedInbox = await deriveInboxQueueId(identity.publicKeyFingerprint, c.publicKeyFingerprint);
          const derivedOutbox = await deriveOutboxQueueId(identity.publicKeyFingerprint, c.publicKeyFingerprint);
          const storedInbox = c.inboxQueueId ?? "(none)";
          const storedOutbox = c.outboxQueueId ?? "(none)";
          return {
            contact: c.displayName,
            selfFp: identity.publicKeyFingerprint.slice(0, 12),
            peerFp: c.publicKeyFingerprint.slice(0, 12),
            inboxDerived: derivedInbox.slice(0, 12),
            inboxStored: storedInbox === "(none)" ? storedInbox : storedInbox.slice(0, 12),
            inboxMatch: storedInbox === derivedInbox ? "✓" : "✗",
            outboxDerived: derivedOutbox.slice(0, 12),
            outboxStored: storedOutbox === "(none)" ? storedOutbox : storedOutbox.slice(0, 12),
            outboxMatch: storedOutbox === derivedOutbox ? "✓" : "✗",
          };
        }));
        console.log(`[relay:validate] connectId=${connectId} self=${identity.publicKeyFingerprint.slice(0, 12)} channelSalt="${connectId}"`);
        if (rows.length > 0) {
          // eslint-disable-next-line no-console
          console.table(rows);
        }
        const mismatches = rows.filter((r) => r.inboxMatch === "✗" || r.outboxMatch === "✗");
        if (mismatches.length > 0) {
          console.warn("[relay:validate] ⚠ stored queue id does not match deterministic derivation — peer will not be able to reach this device:", mismatches);
        }
      } catch (validateErr) {
        console.warn("[relay:validate] failed to compute validation snapshot:", validateErr);
      }

      if (queueIds.length > 0) {
        console.log("[relay] subscribing to inbox queues:", queueIds.map((q) => q.slice(0, 8)));
        const queueChannel = subscribeToQueues(queueIds, (msg) => {
        console.log("[relay] 📩 realtime message on queue", msg.queue_id.slice(0, 8), "id=", msg.id.slice(0, 8));
        if (hasSeen(msg.id)) return;
        void (async () => {
          // Wait for hydration so contacts/identity are guaranteed present.
          await hydrationReadyRef.current;
          // Re-read after hydration AND fall back to durable restore if the
          // in-memory cache is still cold (privacy browsers can clear LS
          // between mount and first inbound message).
          let currentContacts = getContacts();
          let contact = currentContacts.find((c) => c.inboxQueueId === msg.queue_id);
          if (!contact) {
            currentContacts = await restoreContactsIfMissing();
            contact = currentContacts.find((c) => c.inboxQueueId === msg.queue_id);
          }
          if (!contact) {
            console.warn("[relay] ⚠ no contact matches queue after hydration", msg.queue_id.slice(0, 8), "— available:", currentContacts.map((c) => c.inboxQueueId?.slice(0, 8)));
            return;
          }
            try {
              await processRatchetMessage(contact, identity, msg.encrypted_payload, msg.iv);
              markSeen(msg.id);
              console.log("[relay] ✓ processed message from", contact.displayName);
              playIncomingMessageSound();
              incomingHandlersRef.current.forEach((handler) => {
                handler(contact.publicKeyFingerprint, msg.encrypted_payload, msg.iv);
              });
            } catch (error) {
              console.error("[relay queue] failed to process incoming message:", error);
            }
            // NOTE: deliberately NOT deleting from relay — server-side
            // `expires_at` (7 days) handles cleanup. Keeping rows means an
            // offline contact / second device can still receive the message
            // when they come online later. Local `seenMessages` prevents
            // re-processing on this device.
        })();
        }, (queueId, status, error) => handleChannelStatus(`queue:${queueId}:${connectId}`, status, error), String(connectId));
        queueChannelRef.current = queueChannel;

      // Catch-up fetch: pull anything that arrived while this device was
      // offline. This is what lets you re-open the app and see messages
      // your mate sent while you were closed.
        void (async () => {
        await hydrationReadyRef.current;
        for (const qid of queueIds) {
          try {
            const pending = await fetchPendingMessagesForQueue(qid);
            console.log("[relay catch-up] queue", qid.slice(0, 8), "→", pending.length, "pending");
            let currentContacts = getContacts();
            let contact = currentContacts.find((c) => c.inboxQueueId === qid);
            if (!contact) {
              currentContacts = await restoreContactsIfMissing();
              contact = currentContacts.find((c) => c.inboxQueueId === qid);
            }
            if (!contact) {
              console.warn("[relay catch-up] ⚠ no contact for queue", qid.slice(0, 8));
              continue;
            }
            for (const msg of pending) {
              if (hasSeen(msg.id)) continue;
              try {
                await processRatchetMessage(contact, identity, msg.encrypted_payload, msg.iv);
                markSeen(msg.id);
                playIncomingMessageSound();
                incomingHandlersRef.current.forEach((handler) => {
                  handler(contact.publicKeyFingerprint, msg.encrypted_payload, msg.iv);
                });
              } catch (e) {
                console.error("[relay catch-up] decrypt failed:", e);
              }
            }
          } catch (e) {
            console.error("[relay catch-up] fetch failed:", e);
          }
        }
        })();
      }

      if (queueIds.length === 0) {
      const channel = subscribeToMessages(fingerprint, (msg) => {
      if (hasSeen(msg.id)) return;
        void (async () => {
          await hydrationReadyRef.current;
          let contact = getContacts().find(
            (c) => c.publicKeyFingerprint === msg.sender_fingerprint
          );
          if (!contact) {
            const restored = await restoreContactsIfMissing();
            contact = restored.find((c) => c.publicKeyFingerprint === msg.sender_fingerprint);
          }
          if (!contact) {
            console.warn("[relay legacy] ⚠ no contact for sender", msg.sender_fingerprint.slice(0, 12));
            return;
          }
          try {
            await processRatchetMessage(contact, identity, msg.encrypted_payload, msg.iv);
            markSeen(msg.id);
            playIncomingMessageSound();
            incomingHandlersRef.current.forEach((handler) => {
              handler(msg.sender_fingerprint, msg.encrypted_payload, msg.iv);
            });
          } catch (error) {
            console.error("[relay legacy] failed to process incoming message:", error);
          }
          // Same as above — do not delete; rely on server-side expiry.
        })();
      }, (status, error) => handleChannelStatus(`legacy:${connectId}`, status, error), String(connectId));

      channelRef.current = channel;
      expectedChannels = 1;
      }
      if (expectedChannels === 0) {
        dispatch({ type: "SET_RELAY_STATUS", status: "connected" });
      }
    };

    void connectRelay().catch((error) => {
      console.error("[relay] connection setup failed:", error);
      scheduleReconnect("setup failed");
    });

    const handleOnline = () => {
      relayReconnectAttemptRef.current = 0;
      scheduleReconnect("network returned");
    };
    const handleOffline = () => dispatch({ type: "SET_RELAY_STATUS", status: "disconnected" });
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      teardownRelaySubscriptions();
      dispatch({ type: "SET_RELAY_STATUS", status: "disconnected" });
    };
  }, [state.identity?.publicKeyFingerprint, relaySubscriptionKey, ensureContactQueues, teardownRelaySubscriptions, state.contacts.length]);

  const setupIdentity = useCallback(async (displayName: string) => {
    const identity = await createIdentity(displayName);
    dispatch({ type: "SET_IDENTITY", identity });
    syncVault();
  }, [syncVault]);

  const addContactHandler = useCallback(async (name: string, publicKeyB64: string): Promise<Contact> => {
    const publicKey = base64ToPublicKey(publicKeyB64);
    const fingerprint = publicKeyToBase64(publicKey);
    // TOFU: pin the key on first contact
    pinKey(fingerprint, name, publicKey);
    const contact = await addContactDurable({
      displayName: name,
      publicKey,
      publicKeyFingerprint: fingerprint,
    });
    dispatch({ type: "ADD_CONTACT", contact });
    syncVault();
    return contact;
  }, [syncVault]);

  const addContactFromRegistry = useCallback(async (
    fingerprint: string,
    displayName: string,
    publicKeyJwk: JsonWebKey
  ): Promise<Contact> => {
    // Prefer in-memory state (source of truth) — getIdentity() reads
    // localStorage which can be empty on privacy browsers (DuckDuckGo,
    // Safari Private, iOS PWA cold start) even when an identity has been
    // restored from the IndexedDB mirror into React state.
    const identity = state.identity ?? getIdentity() ?? await restoreIdentityIfMissing();
    if (!identity) throw new Error("No identity");

    // TOFU: pin the key on first contact
    pinKey(fingerprint, displayName, publicKeyJwk);

    // Deterministic pairwise queues — both peers compute the same IDs
    // independently, so there is NO race condition between simultaneous adds.
    const { deriveInboxQueueId, deriveOutboxQueueId } = await import("@/crypto/deriveQueue");
    const inboxQueueId = await deriveInboxQueueId(identity.publicKeyFingerprint, fingerprint);
    const outboxQueueId = await deriveOutboxQueueId(identity.publicKeyFingerprint, fingerprint);

    const existingContact = getContacts().find((c) => c.publicKeyFingerprint === fingerprint);
    const contact = existingContact
      ? { ...existingContact, displayName, publicKey: publicKeyJwk, inboxQueueId, outboxQueueId }
      : await addContactDurable({
          displayName,
          publicKey: publicKeyJwk,
          publicKeyFingerprint: fingerprint,
          inboxQueueId,
          outboxQueueId,
        });

    if (existingContact) {
      await updateContactDurable(existingContact.id, {
        displayName,
        publicKey: publicKeyJwk,
        inboxQueueId,
        outboxQueueId,
      });
      dispatch({
        type: "UPDATE_CONTACT",
        id: existingContact.id,
        updates: { displayName, publicKey: publicKeyJwk, inboxQueueId, outboxQueueId },
      });
    } else {
      dispatch({ type: "ADD_CONTACT", contact });
    }

    syncVault();

    // Register my inbox in the background instead of blocking the UI.
    // Some browsers appear to complete the insert server-side but never
    // resolve the client request cleanly, which made the Add button look stuck.
    void createQueue(identity.publicKeyFingerprint, inboxQueueId).catch((error) => {
      console.error("[addContactFromRegistry] queue registration failed:", error);
    });

    // Important: ratchet init is lazy on first send/receive.
    // Eager init here can race with an immediate first send and create
    // different Alice ephemeral keys, which breaks reply decryption.

    return contact;
  }, [state.identity, syncVault]);

  /**
   * Backfill outboxQueueId for legacy contacts created before deterministic
   * queues. New contacts already have it set at add-time.
   */
  const discoverOutboxQueue = useCallback(async (contactId: string, contactFingerprint: string) => {
    const identity = await resolveIdentity();
    if (!identity) return;
    const { deriveOutboxQueueId } = await import("@/crypto/deriveQueue");
    const outboxQueueId = await deriveOutboxQueueId(identity.publicKeyFingerprint, contactFingerprint);
    await updateContactDurable(contactId, { outboxQueueId });
    dispatch({ type: "UPDATE_CONTACT", id: contactId, updates: { outboxQueueId } });
    syncVault();
  }, [resolveIdentity, syncVault]);

  const removeContactHandler = useCallback((id: string) => {
    const contact = getContacts().find((c) => c.id === id);
    if (contact?.inboxQueueId) {
      deleteQueue(contact.inboxQueueId).catch(console.error);
    }
    storeRemoveContact(id);
    deleteMessagesForContact(id);
    deleteRatchetState(id);
    deleteStatsForContact(id);
    dispatch({ type: "REMOVE_CONTACT", id });
    syncVault();
  }, [syncVault]);

  // ─── Outbox drain ─────────────────────────────────────────────────
  // Refresh pending/failed counts from IDB.
  const refreshOutboxCounts = useCallback(async () => {
    const all = await listOutbox();
    const pending = all.filter((e) => e.status === "pending").length;
    const failed = all.filter((e) => e.status === "failed").length;
    dispatch({ type: "SET_OUTBOX_COUNTS", pending, failed });
  }, []);

  const drainingRef = useRef(false);
  const drainOutbox = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      const entries = await listOutbox();
      const pending = entries.filter((e) => e.status === "pending");
      if (pending.length === 0) {
        await refreshOutboxCounts();
        return;
      }
      console.log(`[outbox] draining ${pending.length} pending message(s)`);
      for (const entry of pending) {
        try {
          await sendRelayMessage(entry.queueId, entry.payload, entry.iv, entry.hmac ?? undefined);
          await removeOutbox(entry.id);
          console.log("[outbox] ✓ delivered", entry.id.slice(0, 8));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const attempts = entry.attempts + 1;
          const status = attempts >= MAX_ATTEMPTS ? "failed" : "pending";
          console.warn(`[outbox] retry ${attempts}/${MAX_ATTEMPTS} failed for ${entry.id.slice(0, 8)}: ${msg}`);
          await updateOutbox(entry.id, { attempts, lastError: msg, status });
        }
      }
    } finally {
      drainingRef.current = false;
      await refreshOutboxCounts();
    }
  }, [refreshOutboxCounts]);

  const retryFailedOutbox = useCallback(async () => {
    const entries = await listOutbox();
    for (const entry of entries.filter((e) => e.status === "failed")) {
      await updateOutbox(entry.id, { status: "pending", attempts: 0, lastError: undefined });
    }
    await drainOutbox();
  }, [drainOutbox]);

  // Initial count on mount
  useEffect(() => {
    void refreshOutboxCounts();
  }, [refreshOutboxCounts]);

  // Drain whenever the relay transitions to connected.
  useEffect(() => {
    if (state.relayStatus === "connected") {
      void drainOutbox();
    }
  }, [state.relayStatus, drainOutbox]);

  const sendMessageHandler = useCallback(async (contactId: string, plaintext: string): Promise<StoredMessage> => {
    // Hard hydration before send: privacy browsers (iOS PWA, DDG, Brave Strict)
    // can lose plaintext localStorage between the moment the contact was added
    // and the moment the user taps Send. Pull from IndexedDB + the encrypted
    // vault first so we have the freshest possible identity + contacts before
    // we even consider failing.
    try { await restorePhantomStorageFromIDB(); } catch {}
    const identity = (await resolveIdentity()) ?? (await restoreIdentityIfMissing());
    const restoredContacts = await restoreContactsIfMissing();
    if (identity && !state.identity) {
      dispatch({ type: "SET_IDENTITY", identity });
    }
    if (state.contacts.length === 0 && restoredContacts.length > 0) {
      dispatch({ type: "SET_CONTACTS", contacts: restoredContacts });
    }
    const rawContact = state.contacts.find((c) => c.id === contactId) ?? restoredContacts.find((c) => c.id === contactId);
    const contact = rawContact ? await ensureContactQueues(rawContact) : undefined;
    if (!identity && !contact) {
      console.error("[send] BOTH missing", { contactId, stateContacts: state.contacts.length, storageContacts: restoredContacts.length, hasIdentity: !!getIdentity() });
      throw new Error("Missing identity or contact — please re-unlock the app");
    }
    if (!identity) {
      console.error("[send] identity missing", { hasMemIdentity: !!getIdentity(), hasStateIdentity: !!state.identity });
      throw new Error("Missing identity — please re-unlock the app");
    }
    if (!contact) {
      console.error("[send] contact missing", { contactId, stateContacts: state.contacts.map(c => c.id), storageContacts: restoredContacts.map(c => c.id) });
      throw new Error("Missing contact — try refreshing the contacts list");
    }
    console.log("[send] →", {
      contactId,
      hasOutbox: !!contact.outboxQueueId,
      outboxId: contact.outboxQueueId?.slice(0, 8),
      myFp: identity.publicKeyFingerprint.slice(0, 12),
      peerFp: contact.publicKeyFingerprint.slice(0, 12),
    });

    // Try Double Ratchet first
    let ratchetState = getRatchetState(contactId);
    if (!ratchetState) {
      const isInit = isAliceRole(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
      ratchetState = await getOrInitRatchet(
        contactId,
        identity.keyPair.privateKey,
        identity.keyPair,
        contact.publicKey,
        isInit
      );
    }

    let payload: string;
    let iv: string;
    let storeCiphertext: string;
    let storeIv: string;

    // Legacy shared key for local storage
    const privateKey = await importPrivateKey(identity.keyPair.privateKey);
    const publicKey = await importPublicKey(contact.publicKey);
    const sharedKey = await deriveSharedKey(privateKey, publicKey);

    if (ratchetState.sendChainKey) {
      // Use Double Ratchet encryption for the wire
      const { newState, message } = await ratchetEncrypt(ratchetState, plaintext);
      saveRatchetState(contactId, newState);
      incrementSentKeys(contactId);
      payload = JSON.stringify(message);
      iv = message.iv;
      // Re-encrypt with legacy key for local storage (so we can read it back)
      const reEncrypted = await encryptMessage(plaintext, sharedKey);
      storeCiphertext = reEncrypted.ciphertext;
      storeIv = reEncrypted.iv;
    } else {
      // Fallback: use legacy encryption for both wire and storage
      const encrypted = await encryptMessage(plaintext, sharedKey);
      payload = encrypted.ciphertext;
      iv = encrypted.iv;
      storeCiphertext = encrypted.ciphertext;
      storeIv = encrypted.iv;
    }

    // HMAC sign the payload
    const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
    const hmacSig = await signPayload(hmacKey, payload);

    // Persist locally FIRST so the user always sees their message even if the
    // relay send fails. We attempt the send; on failure we enqueue to outbox
    // and let the drain loop retry on reconnect.
    const stored = await saveMessage(contactId, storeCiphertext, storeIv, true, state.disappearTimer);
    const outboxQueueId = contact.outboxQueueId!;

    try {
      await sendRelayMessage(outboxQueueId, payload, iv, hmacSig);
      console.log("[send] ✓ pushed to relay queue", outboxQueueId.slice(0, 8));
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      console.warn("[send] relay push failed, enqueueing to outbox:", msg);
      await enqueueOutbox({
        id: stored.id,
        contactId,
        queueId: outboxQueueId,
        payload,
        iv,
        hmac: hmacSig ?? null,
        enqueuedAt: Date.now(),
        attempts: 0,
        status: "pending",
      });
      void refreshOutboxCounts();
    }

    syncVault();
    return stored;
  }, [resolveIdentity, state.contacts, state.disappearTimer, ensureContactQueues, syncVault]);

  const getDecryptedMessages = useCallback(async (contactId: string) => {
    const identity = await resolveIdentity();
    const contact = state.contacts.find((c) => c.id === contactId) ?? getContacts().find((c) => c.id === contactId);
    if (!identity || !contact) return [];

    // All stored messages use legacy AES-GCM encryption (ratchet messages
    // are re-encrypted with the legacy key on arrival/send for consistent storage)
    const privateKey = await importPrivateKey(identity.keyPair.privateKey);
    const publicKey = await importPublicKey(contact.publicKey);
    const sharedKey = await deriveSharedKey(privateKey, publicKey);

    const messages = getMessagesForContact(contactId);
    const decrypted = await Promise.all(
      messages.map(async (m) => {
        const inner = await unwrapStoredMessage(m);
        if (!inner) {
          // Forward-secrecy: epoch key purged — message is gone forever.
          return { id: m.id, text: "[Message expired]", fromMe: m.fromMe, timestamp: m.timestamp, status: m.status, hmacVerified: m.hmacVerified };
        }
        try {
          const text = await decryptMessage(
            { ciphertext: inner.ciphertext, iv: inner.iv, timestamp: m.timestamp },
            sharedKey
          );
          return { id: m.id, text, fromMe: m.fromMe, timestamp: m.timestamp, status: m.status, hmacVerified: m.hmacVerified };
        } catch {
          return { id: m.id, text: "[Decryption failed]", fromMe: m.fromMe, timestamp: m.timestamp, status: m.status, hmacVerified: m.hmacVerified };
        }
      })
    );
    return decrypted.filter((m) => !getHiddenControlType(m.text));
  }, [resolveIdentity, state.contacts]);

  const setDisappearTimerHandler = useCallback((timer: DisappearTimer) => {
    localStorage.setItem("phantom_disappear_timer", timer);
    dispatch({ type: "SET_DISAPPEAR_TIMER", timer });
    syncVault();
  }, [syncVault]);

  const burnAllData = useCallback(() => {
    const contacts = getContacts();
    contacts.forEach((c) => {
      if (c.inboxQueueId) deleteQueue(c.inboxQueueId).catch(() => {});
    });

    if (channelRef.current) {
      unsubscribeFromMessages(channelRef.current);
      channelRef.current = null;
    }
    if (queueChannelRef.current) {
      queueChannelRef.current.forEach(ch => unsubscribeFromMessages(ch));
      queueChannelRef.current = null;
    }
    clearIdentity();
    clearContacts();
    clearAllMessages();
    clearAllRatchetStates();
    clearSeen();
    clearGroups();
    clearAllGroupMessages();
    clearPinnedKeys();
    clearVault();
    void clearPhantomStorageFromIDB();
    clearRatchetStats();
    // Forward-secure: destroy all epoch keys so any orphaned ciphertext is unreadable.
    import("@/crypto/epochKeys").then((m) => m.destroyAllEpochKeys()).catch(() => {});
    void clearOutbox();
    localStorage.removeItem("phantom_disappear_timer");
    dispatch({ type: "RESET" });
  }, []);

  // Sign out: persist data into the encrypted vault, tear down realtime,
  // lock the vault, clear the session-unlock flag, and reset in-memory state.
  // The encrypted vault is NOT destroyed — reopening the browser will land on
  // the LockScreen (passcode prompt), never on the "Create Identity" screen.
  const signOut = useCallback(async () => {
    // 1. Flush any pending plaintext into the encrypted vault before we lock.
    try {
      await syncVaultFromLocalStorage();
    } catch (err) {
      console.warn("[signOut] vault sync failed:", err);
    }
    try {
      await mirrorPhantomStorageToIDB();
    } catch (err) {
      console.warn("[signOut] IDB mirror failed:", err);
    }

    // 2. Tear down realtime subscriptions so we stop receiving messages.
    if (channelRef.current) {
      try { unsubscribeFromMessages(channelRef.current); } catch {}
      channelRef.current = null;
    }
    if (queueChannelRef.current) {
      queueChannelRef.current.forEach((ch) => {
        try { unsubscribeFromMessages(ch); } catch {}
      });
      queueChannelRef.current = null;
    }

    // 3. Drop the in-memory vault key and session unlock flag.
    try { lockVault(); } catch {}
    clearSessionUnlock();

    // 4. Reset React state — UI sees no identity, no contacts, no messages.
    dispatch({ type: "RESET" });

    // 5. Tell App.tsx to show the LockScreen if a vault exists, otherwise
    //    the landing page will render Create Identity. Either way the user
    //    is NOT auto-dropped into chats.
    if (hasVault()) {
      window.dispatchEvent(new Event("phantom:lock"));
    }
  }, []);

  const searchRegisteredUsers = useCallback(async (query: string) => {
    return searchUsers(query);
  }, []);

  const onIncomingMessage = useCallback((handler: IncomingMessageHandler) => {
    incomingHandlersRef.current.add(handler);
    return () => {
      incomingHandlersRef.current.delete(handler);
    };
  }, []);

  const processIncomingMessages = useCallback(async () => {
    const identity = await resolveIdentity();
    if (!identity) return;

    const restoredContacts = await restoreContactsIfMissing();
    const contacts = await Promise.all(restoredContacts.map((contact) => ensureContactQueues(contact)));
    if (state.contacts.length === 0 && contacts.length > 0) {
      dispatch({ type: "SET_CONTACTS", contacts });
    }

    for (const contact of contacts) {
      if (!contact.inboxQueueId) continue;
      const pending = await fetchPendingMessagesForQueue(contact.inboxQueueId);
      for (const msg of pending) {
        if (hasSeen(msg.id)) continue;
        try {
          await processRatchetMessage(contact, identity, msg.encrypted_payload, msg.iv);
          markSeen(msg.id);
        } catch (e) {
          console.error("[processIncomingMessages] decrypt failed:", e);
        }
      }
    }

    const pending = await fetchPendingMessages(identity.publicKeyFingerprint);
    for (const msg of pending) {
      if (hasSeen(msg.id)) continue;
      const contact = contacts.find(
        (c) => c.publicKeyFingerprint === msg.sender_fingerprint
      );
      if (contact) {
        try {
          await processRatchetMessage(contact, identity, msg.encrypted_payload, msg.iv);
          markSeen(msg.id);
        } catch (e) {
          console.error("[processIncomingMessages legacy] decrypt failed:", e);
        }
      }
    }
  }, [resolveIdentity, state.contacts.length, ensureContactQueues]);

  /**
   * Process an incoming message: try ratchet decryption, fall back to legacy,
   * then store the message (ciphertext for legacy, or the raw payload).
   * Returns the decrypted plaintext if available (for read receipt detection).
   */
  const processRatchetMessage = useCallback(async (
    contact: Contact,
    identity: Identity,
    encryptedPayload: string,
    iv: string
  ) => {
    // Extract HMAC envelope if present
    const { payload: rawPayload, hmac } = extractHmacEnvelope(encryptedPayload);

    // Verify HMAC if present
    let hmacVerified: boolean | null = null;
    if (hmac) {
      try {
        const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
        const valid = await verifyPayload(hmacKey, rawPayload, hmac);
        hmacVerified = valid;
        if (!valid) {
          console.warn("⚠️ HMAC verification failed — message may have been tampered with");
        }
      } catch (e) {
        console.warn("HMAC verification error:", e);
        hmacVerified = false;
      }
    }

    // Try to parse as ratchet message
    let ratchetMsg: RatchetMessage | null = null;
    try {
      ratchetMsg = JSON.parse(rawPayload) as RatchetMessage;
    } catch {
      // Not JSON — legacy message
    }

    if (ratchetMsg?.header?.ephemeralKey) {
      // Ratchet message: decrypt and update state
      try {
        let ratchetState = getRatchetState(contact.id);
        if (!ratchetState) {
          const isInit = isAliceRole(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
          ratchetState = await getOrInitRatchet(
            contact.id,
            identity.keyPair.privateKey,
            identity.keyPair,
            contact.publicKey,
            isInit
          );
        }
        const { newState, plaintext } = await ratchetDecrypt(ratchetState, ratchetMsg);
        saveRatchetState(contact.id, newState);
        incrementReceivedKeys(contact.id);
        // Track DH ratchet if ephemeral key changed
        if (!ratchetState.peerPublicKey || 
            ratchetMsg.header.ephemeralKey.x !== ratchetState.peerPublicKey.x ||
            ratchetMsg.header.ephemeralKey.y !== ratchetState.peerPublicKey.y) {
          recordDhRatchet(contact.id);
        }

        // Check if this is a control message (read receipt or typing indicator)
        try {
          const parsed = JSON.parse(plaintext);
          if (parsed?.__type === "read_receipt") {
            markOutgoingAsRead(contact.id);
            return;
          }
          if (parsed?.__type === "typing") {
            dispatch({ type: "SET_TYPING", contactId: contact.id, typing: true });
            setTimeout(() => dispatch({ type: "SET_TYPING", contactId: contact.id, typing: false }), 4000);
            return;
          }
          if (parsed?.__type === "group_message") {
            // Store as a group message
            const sharedKey2 = await deriveSharedKey(
              await importPrivateKey(identity.keyPair.privateKey),
              await importPublicKey(contact.publicKey)
            );
            const reEnc = await encryptMessage(parsed.text, sharedKey2);
            saveGroupMessage({
              groupId: parsed.groupId,
              senderContactId: contact.id,
              senderName: parsed.senderName || contact.displayName,
              ciphertext: reEnc.ciphertext,
              iv: reEnc.iv,
              timestamp: Date.now(),
            });
            // Auto-create group locally if we don't have it
            if (!getGroup(parsed.groupId)) {
              const group = storeCreateGroup(parsed.groupName || "Group", [contact.id], contact.publicKeyFingerprint);
              // Override ID to match sender's group ID
              const groups = getGroups();
              const idx = groups.findIndex(g => g.id === group.id);
              if (idx !== -1) {
                groups[idx].id = parsed.groupId;
                localStorage.setItem("phantom_groups", JSON.stringify(groups));
              }
              dispatch({ type: "ADD_GROUP", group: { ...group, id: parsed.groupId } });
            }
            syncVault();
            return;
          }
        } catch {
          // Not a control message — it's a normal message
        }

        // Store plaintext encrypted with legacy key so we can read it back
        const privateKey = await importPrivateKey(identity.keyPair.privateKey);
        const publicKey = await importPublicKey(contact.publicKey);
        const sharedKey = await deriveSharedKey(privateKey, publicKey);
        const reEncrypted = await encryptMessage(plaintext, sharedKey);
        await saveMessage(contact.id, reEncrypted.ciphertext, reEncrypted.iv, false, state.disappearTimer, hmacVerified);
        syncVault();
      } catch (e) {
        console.error("Ratchet decryption failed, storing raw:", e);
        // Ratchet desync — most commonly: peer kept their ratchet state
        // while ours was wiped (panic wipe / vault reset / localStorage
        // clear by a privacy browser). We can never recover the chain key
        // for this message, so we DROP the un-decryptable ciphertext
        // (storing the raw ratchet JSON as a bubble would just render as
        // "[Decryption failed]" on every reload) and trigger a fresh
        // pairwise handshake:
        //   1. Wipe our local ratchet state for this contact.
        //   2. Send a one-shot legacy "ratchet_reset" control to the peer.
        //   3. Peer wipes their state on receipt. Both sides re-init from
        //      scratch on the next outbound message.
        try {
          deleteRatchetState(contact.id);
        } catch (wipeErr) {
          console.warn("[ratchet-resync] local state wipe failed:", wipeErr);
        }
        try {
          const now = Date.now();
          const last = lastResetSentRef.current[contact.id] ?? 0;
          if (now - last > 30_000) {
            lastResetSentRef.current[contact.id] = now;
            await sendRatchetResetSignal(contact, identity);
          }
        } catch (signalErr) {
          console.warn("[ratchet-resync] reset signal send failed:", signalErr);
        }
        syncVault();
      }
    } else {
      // Legacy: check if it's a control message
      try {
        const parsed = JSON.parse(rawPayload);
        if (parsed?.__type === "read_receipt") {
          markOutgoingAsRead(contact.id);
          return;
        }
        if (parsed?.__type === "typing") {
          dispatch({ type: "SET_TYPING", contactId: contact.id, typing: true });
          setTimeout(() => dispatch({ type: "SET_TYPING", contactId: contact.id, typing: false }), 4000);
          return;
        }
      } catch {
        // Not JSON — normal legacy message
      }
      try {
        const privateKey = await importPrivateKey(identity.keyPair.privateKey);
        const publicKey = await importPublicKey(contact.publicKey);
        const sharedKey = await deriveSharedKey(privateKey, publicKey);
        const plaintext = await decryptMessage({ ciphertext: rawPayload, iv, timestamp: Date.now() }, sharedKey);
        const controlType = getHiddenControlType(plaintext);
        if (controlType === "read_receipt") {
          markOutgoingAsRead(contact.id);
          return;
        }
        if (controlType === "typing") {
          dispatch({ type: "SET_TYPING", contactId: contact.id, typing: true });
          setTimeout(() => dispatch({ type: "SET_TYPING", contactId: contact.id, typing: false }), 4000);
          return;
        }
        if (controlType === "ratchet_reset") {
          // Peer told us their ratchet state for us is gone — drop ours so
          // the next outbound message re-bootstraps a fresh Double Ratchet
          // session from scratch. No bubble is rendered.
          console.warn("[ratchet-resync] peer requested reset, wiping local ratchet for", contact.displayName);
          try { deleteRatchetState(contact.id); } catch {}
          // Reset the throttle so a future genuine desync isn't suppressed.
          delete lastResetSentRef.current[contact.id];
          return;
        }
      } catch {
        // Not an encrypted legacy control packet — store normally.
      }
      await saveMessage(contact.id, rawPayload, iv, false, state.disappearTimer, hmacVerified);
      syncVault();
    }
  }, [state.disappearTimer, syncVault]);

  /**
   * Send an encrypted read receipt to a contact through pairwise queues.
   * The receipt is a special control message that doesn't get stored.
   */
  const sendReadReceipt = useCallback(async (contactId: string) => {
    const identity = await resolveIdentity();
    const contact = state.contacts.find((c) => c.id === contactId) ?? getContacts().find((c) => c.id === contactId);
    if (!identity || !contact) return;

    // Mark local incoming messages as read
    const readIds = markMessagesAsRead(contactId);
    if (readIds.length === 0) return; // Nothing new to acknowledge

    const receiptPayload = JSON.stringify({
      __type: "read_receipt",
      timestamp: Date.now(),
    });

    // Encrypt and send via the same ratchet/queue path as regular messages
    let ratchetState = getRatchetState(contactId);
    if (!ratchetState) {
      const isInit = isAliceRole(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
      ratchetState = await getOrInitRatchet(
        contactId,
        identity.keyPair.privateKey,
        identity.keyPair,
        contact.publicKey,
        isInit
      );
    }

    let payload: string;
    let iv: string;

    if (ratchetState.sendChainKey) {
      const { newState, message } = await ratchetEncrypt(ratchetState, receiptPayload);
      saveRatchetState(contactId, newState);
      payload = JSON.stringify(message);
      iv = message.iv;
    } else {
      // Fallback: send as plaintext JSON (legacy)
      const privateKey = await importPrivateKey(identity.keyPair.privateKey);
      const publicKey = await importPublicKey(contact.publicKey);
      const sharedKey = await deriveSharedKey(privateKey, publicKey);
      const encrypted = await encryptMessage(receiptPayload, sharedKey);
      payload = encrypted.ciphertext;
      iv = encrypted.iv;
    }

    // HMAC sign
    const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
    const hmacSig = await signPayload(hmacKey, payload);

    if (contact.outboxQueueId) {
      await sendRelayMessage(contact.outboxQueueId, payload, iv, hmacSig);
    } else {
      await discoverOutboxQueue(contact.id, contact.publicKeyFingerprint);
      const refreshed = getContacts().find((c) => c.id === contactId);
      if (refreshed?.outboxQueueId) {
        await sendRelayMessage(refreshed.outboxQueueId, payload, iv, hmacSig);
      }
    }
  }, [resolveIdentity, state.contacts, discoverOutboxQueue]);

  /**
   * Send an encrypted typing indicator to a contact through pairwise queues.
   * Throttled: only sends if we haven't sent one in the last 3 seconds.
   */
  const lastTypingSentRef = useRef<Record<string, number>>({});
  const sendTypingIndicator = useCallback(async (contactId: string) => {
    const now = Date.now();
    if (lastTypingSentRef.current[contactId] && now - lastTypingSentRef.current[contactId] < 3000) return;
    lastTypingSentRef.current[contactId] = now;

    const identity = await resolveIdentity();
    const contact = state.contacts.find((c) => c.id === contactId) ?? getContacts().find((c) => c.id === contactId);
    if (!identity || !contact || !contact.outboxQueueId) return;

    const typingPayload = JSON.stringify({ __type: "typing", timestamp: now });

    let ratchetState = getRatchetState(contactId);
    if (!ratchetState) {
      const isInit = isAliceRole(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
      ratchetState = await getOrInitRatchet(contactId, identity.keyPair.privateKey, identity.keyPair, contact.publicKey, isInit);
    }

    let payload: string;
    let iv: string;

    if (ratchetState.sendChainKey) {
      const { newState, message } = await ratchetEncrypt(ratchetState, typingPayload);
      saveRatchetState(contactId, newState);
      payload = JSON.stringify(message);
      iv = message.iv;
    } else {
      const privateKey = await importPrivateKey(identity.keyPair.privateKey);
      const publicKey = await importPublicKey(contact.publicKey);
      const sharedKey = await deriveSharedKey(privateKey, publicKey);
      const encrypted = await encryptMessage(typingPayload, sharedKey);
      payload = encrypted.ciphertext;
      iv = encrypted.iv;
    }

    // HMAC sign
    const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
    const hmacSig = await signPayload(hmacKey, payload);

    await sendRelayMessage(contact.outboxQueueId, payload, iv, hmacSig);
  }, [resolveIdentity, state.contacts]);

  // ─── Group Chat Functions ────────────────────────────────────────────

  const createGroupChat = useCallback((name: string, memberIds: string[]) => {
    const identity = getIdentity();
    if (!identity) throw new Error("No identity");
    const group = storeCreateGroup(name, memberIds, identity.publicKeyFingerprint);
    dispatch({ type: "ADD_GROUP", group });
    syncVault();
    return group;
  }, [syncVault]);

  const sendGroupMessage = useCallback(async (groupId: string, plaintext: string) => {
    const identity = getIdentity();
    if (!identity) throw new Error("No identity");
    const group = getGroup(groupId);
    if (!group) throw new Error("Group not found");

    // Wrap plaintext with group envelope so recipients know it's a group message
    const envelope = JSON.stringify({
      __type: "group_message",
      groupId: group.id,
      groupName: group.name,
      senderName: identity.displayName,
      text: plaintext,
    });

    // Fan out: encrypt and send to each member via their pairwise queue
    const contacts = getContacts();
    for (const memberId of group.memberIds) {
      const contact = contacts.find((c) => c.id === memberId);
      if (!contact) continue;

      let ratchetState = getRatchetState(memberId);
      if (!ratchetState) {
        const isInit = isAliceRole(identity.publicKeyFingerprint, contact.publicKeyFingerprint);
        ratchetState = await getOrInitRatchet(memberId, identity.keyPair.privateKey, identity.keyPair, contact.publicKey, isInit);
      }

      let payload: string;
      let iv: string;

      const privateKey = await importPrivateKey(identity.keyPair.privateKey);
      const publicKey = await importPublicKey(contact.publicKey);
      const sharedKey = await deriveSharedKey(privateKey, publicKey);

      if (ratchetState.sendChainKey) {
        const { newState, message } = await ratchetEncrypt(ratchetState, envelope);
        saveRatchetState(memberId, newState);
        payload = JSON.stringify(message);
        iv = message.iv;
      } else {
        const encrypted = await encryptMessage(envelope, sharedKey);
        payload = encrypted.ciphertext;
        iv = encrypted.iv;
      }

      if (contact.outboxQueueId) {
        const hmacKey = await getHmacKeyForContact(identity.keyPair.privateKey, contact.publicKey);
        const hmacSig = await signPayload(hmacKey, payload);
        await sendRelayMessage(contact.outboxQueueId, payload, iv, hmacSig);
      }
    }

    // Store locally as our own message (encrypt with a stable key for storage)
    const firstMember = contacts.find((c) => group.memberIds.includes(c.id));
    if (firstMember) {
      const privateKey = await importPrivateKey(identity.keyPair.privateKey);
      const publicKey = await importPublicKey(firstMember.publicKey);
      const sharedKey = await deriveSharedKey(privateKey, publicKey);
      const stored = await encryptMessage(plaintext, sharedKey);
      saveGroupMessage({
        groupId,
        senderContactId: null,
        senderName: identity.displayName,
        ciphertext: stored.ciphertext,
        iv: stored.iv,
        timestamp: Date.now(),
      });
      syncVault();
    }
  }, [state.contacts, syncVault]);

  const getDecryptedGroupMessages = useCallback(async (groupId: string) => {
    const identity = getIdentity();
    if (!identity) return [];

    const messages = getGroupMessages(groupId);
    const contacts = getContacts();
    const group = getGroup(groupId);
    if (!group) return [];

    // We need a key to decrypt stored messages — use first member's shared key
    const firstMember = contacts.find((c) => group.memberIds.includes(c.id));
    if (!firstMember) return [];

    const privateKey = await importPrivateKey(identity.keyPair.privateKey);
    const publicKey = await importPublicKey(firstMember.publicKey);
    const sharedKey = await deriveSharedKey(privateKey, publicKey);

    const decrypted = await Promise.all(
      messages.map(async (m) => {
        try {
          const text = await decryptMessage(
            { ciphertext: m.ciphertext, iv: m.iv, timestamp: m.timestamp },
            sharedKey
          );
          return {
            id: m.id,
            text,
            fromMe: m.senderContactId === null,
            senderName: m.senderName,
            timestamp: m.timestamp,
          };
        } catch {
          return {
            id: m.id,
            text: "[Decryption failed]",
            fromMe: m.senderContactId === null,
            senderName: m.senderName,
            timestamp: m.timestamp,
          };
        }
      })
    );
    return decrypted;
  }, [state.contacts]);

  const deleteGroupChat = useCallback((groupId: string) => {
    storeDeleteGroup(groupId);
    deleteGroupMessages(groupId);
    dispatch({ type: "REMOVE_GROUP", id: groupId });
  }, []);

  return (
    <CryptoContext.Provider
      value={{
        state,
        setupIdentity,
        reloadState,
        addContact: addContactHandler,
        addContactFromRegistry,
        removeContact: removeContactHandler,
        sendMessage: sendMessageHandler,
        getDecryptedMessages,
        setDisappearTimer: setDisappearTimerHandler,
        burnAllData,
        signOut,
        searchRegisteredUsers,
        onIncomingMessage,
        processIncomingMessages,
        sendReadReceipt,
        sendTypingIndicator,
        createGroupChat,
        sendGroupMessage,
        getDecryptedGroupMessages,
        deleteGroupChat,
        drainOutbox,
        retryFailedOutbox,
      }}
    >
      {children}
    </CryptoContext.Provider>
  );
}
