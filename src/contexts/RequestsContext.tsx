// Message requests and group invites from people who aren't in your contacts yet.
//
// Listens on this phone's request inbox (see lib/requests.ts): registers it, rings on the
// doorbell, checks every 30 seconds as a fallback, opens and verifies each request, and keeps
// it until you accept, decline or block. Accepting adds the person as a contact, so their
// waiting messages arrive; for a group invite it also joins you to the group.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { useToast } from "@/hooks/use-toast";
import { getContacts } from "@/store/contacts";
import { block, isBlocked } from "@/store/blocked";
import { base64ToPublicKey } from "@/crypto/keys";
import { myRequestInbox, openRequest, unpadRequest } from "@/lib/requests";
import { ackInbox, fetchInbox, registerInbox, subscribeDoorbell, unsubscribeDoorbell } from "@/services/relayV2";
import { addRequest, getRequests, onRequestsChange, removeRequest, type PendingRequest } from "@/store/messageRequests";
import { loadVanishing, updateVanishing } from "@/store/vanishingGroups";
import { useVanishingGroups } from "@/contexts/VanishingGroupsContext";
import { playIncomingMessageSound } from "@/lib/notificationSound";

const POLL_MS = 30_000;

interface RequestsValue {
  requests: PendingRequest[];
  accept: (id: string) => Promise<void>;
  decline: (id: string) => void;
  blockSender: (id: string) => void;
}

const Ctx = createContext<RequestsValue | null>(null);

const describe = (r: PendingRequest) =>
  r.body.t === "contact"
    ? `${r.body.name || "Someone"} wants to message you`
    : `${r.body.name || "Someone"} invited you to ${r.body.groupName ? `"${r.body.groupName}"` : "a group"}`;

export function RequestsProvider({ children }: { children: React.ReactNode }) {
  const { state, addContactFromRegistry, joinGroupChat } = useCrypto();
  const { acceptInvite } = useVanishingGroups();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<PendingRequest[]>(getRequests);
  const identity = state.identity;

  useEffect(() => onRequestsChange(() => setRequests(getRequests())), []);

  // Invites from people already in your contacts don't need a request: file them straight away.
  const fileFromContact = useCallback(
    (from: string, body: PendingRequest["body"]) => {
      const contact = getContacts().find((c) => c.publicKeyFingerprint === from);
      if (!contact) return false;
      if (body.t === "contact") return true; // already a contact: nothing to ask
      if (body.t === "group_invite") {
        joinGroupChat(body.groupId, body.groupName, contact.id);
        toast({ title: `Added to ${body.groupName || "a group"}`, description: `By ${contact.displayName}` });
        return true;
      }
      // Vanishing invite: the same invite the group screen shows (it may already be there).
      if (!loadVanishing().invites.some((i) => i.groupId === body.groupId) && !loadVanishing().groups.some((g) => g.id === body.groupId)) {
        updateVanishing((d) => ({
          ...d,
          invites: [...d.invites, { groupId: body.groupId, name: body.groupName, adminFingerprint: from, adminName: body.name, receivedAt: Date.now() }],
        }));
        toast({ title: `Invite to ${body.groupName || "a vanishing group"}`, description: `From ${contact.displayName}` });
      }
      return true;
    },
    [joinGroupChat, toast]
  );

  useEffect(() => {
    if (!identity) return;
    const me = { fingerprint: identity.publicKeyFingerprint, privateKey: identity.keyPair.privateKey };
    let cancelled = false;
    let draining = false;
    let doorbell: ReturnType<typeof subscribeDoorbell> | null = null;
    let inbox: Awaited<ReturnType<typeof myRequestInbox>> | null = null;

    const drain = async () => {
      if (!inbox || draining) return;
      draining = true;
      try {
        const envelopes = await fetchInbox(inbox.id, inbox.secrets);
        const done: string[] = [];
        for (const env of envelopes) {
          done.push(env.id);
          const opened = await openRequest(me, unpadRequest(env.encrypted_payload));
          if (!opened || opened.from === me.fingerprint || isBlocked(opened.from)) continue;
          if (fileFromContact(opened.from, opened.body)) continue;
          if (addRequest({ from: opened.from, body: opened.body }) && !cancelled) {
            playIncomingMessageSound();
            const req = getRequests().find((r) => r.from === opened.from);
            toast({
              title: req ? describe(req) : "New message request",
              description: opened.body.t === "contact" && opened.body.preview ? opened.body.preview : "Open Chats to accept or decline.",
            });
          }
        }
        if (done.length) await ackInbox(inbox.id, inbox.secrets, done);
      } catch (e) {
        console.warn("[requests] fetch failed", e);
      } finally {
        draining = false;
      }
    };

    void (async () => {
      inbox = await myRequestInbox(me.fingerprint, me.privateKey);
      const ok = await registerInbox(inbox.id, inbox.secrets).catch(() => false);
      if (!ok) console.warn("[requests] request inbox isn't registered to this phone");
      if (cancelled) return;
      doorbell = subscribeDoorbell(inbox.secrets, () => void drain());
      void drain();
    })();
    const poll = setInterval(() => void drain(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void drain();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      if (doorbell) unsubscribeDoorbell(doorbell);
    };
  }, [identity, fileFromContact, toast]);

  const accept = useCallback(
    async (id: string) => {
      const req = getRequests().find((r) => r.id === id);
      if (!req) return;
      let contact = getContacts().find((c) => c.publicKeyFingerprint === req.from);
      if (!contact) contact = await addContactFromRegistry(req.from, req.body.name || "New contact", base64ToPublicKey(req.from));
      removeRequest(id);
      if (req.body.t === "contact") {
        navigate(`/chat/${contact.id}`);
      } else if (req.body.t === "group_invite") {
        joinGroupChat(req.body.groupId, req.body.groupName, contact.id);
        navigate(`/group/${req.body.groupId}`);
      } else {
        const body = req.body;
        if (!loadVanishing().invites.some((i) => i.groupId === body.groupId)) {
          updateVanishing((d) => ({
            ...d,
            invites: [...d.invites, { groupId: body.groupId, name: body.groupName, adminFingerprint: req.from, adminName: body.name, receivedAt: Date.now() }],
          }));
        }
        await acceptInvite(body.groupId);
        toast({ title: `Joining ${body.groupName || "the group"}`, description: "It appears in Vanishing groups as soon as the admin's phone confirms." });
        navigate("/vanishing");
      }
    },
    [addContactFromRegistry, joinGroupChat, acceptInvite, navigate, toast]
  );

  const decline = useCallback((id: string) => removeRequest(id), []);

  const blockSender = useCallback((id: string) => {
    const req = getRequests().find((r) => r.id === id);
    if (!req) return;
    block(req.from, req.body.name);
    removeRequest(id);
  }, []);

  return <Ctx.Provider value={{ requests, accept, decline, blockSender }}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRequests(): RequestsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRequests must be used inside RequestsProvider");
  return ctx;
}

// eslint-disable-next-line react-refresh/only-export-components
export { describe as describeRequest };
