import type { Identity } from "@/store/identity";
import type { Contact } from "@/store/contacts";
import type { StoredMessage, DisappearTimer } from "@/store/messages";
import type { Group } from "@/store/groups";

export interface CryptoState {
  identity: Identity | null;
  contacts: Contact[];
  groups: Group[];
  initialized: boolean;
  disappearTimer: DisappearTimer;
  relayConnected: boolean;
  relayStatus: "disconnected" | "connecting" | "connected" | "reconnecting";
  typingContacts: Record<string, number>;
  outboxPending: number;
  outboxFailed: number;
}

/** Call setup message, sent as an encrypted control message over the contact's queue. */
export interface CallSignal {
  __type: "call";
  kind: "offer" | "answer" | "end";
  callId: string;
  /** SDP for offer/answer (ICE candidates already gathered into it). */
  sdp?: string;
  /** Why the call ended: hung up, declined, busy, no answer, or the callee can't take calls. */
  reason?: "hangup" | "declined" | "busy" | "timeout" | "failed";
  /** Sender's clock, so replayed or stale signals can be ignored. */
  ts: number;
}

export type CallSignalHandler = (contactId: string, signal: CallSignal) => void;

/** Hidden control message (vanishing-group invites and membership), with the sender's contact id and fingerprint. */
export type ControlMessageHandler = (contactId: string, senderFingerprint: string, body: Record<string, unknown>) => void;

export type IncomingMessageHandler = (senderFingerprint: string, encryptedPayload: string, iv: string) => void;

export interface CryptoContextValue {
  state: CryptoState;
  setupIdentity: (displayName: string) => Promise<void>;
  reloadState: () => Promise<void>;
  addContact: (name: string, publicKeyB64: string) => Promise<Contact>;
  addContactFromRegistry: (fingerprint: string, displayName: string, publicKeyJwk: JsonWebKey) => Promise<Contact>;
  removeContact: (id: string) => void;
  sendMessage: (contactId: string, plaintext: string) => Promise<StoredMessage>;
  getDecryptedMessages: (contactId: string) => Promise<Array<{ id: string; text: string; fromMe: boolean; timestamp: number; status: string; hmacVerified?: boolean | null }>>;
  setDisappearTimer: (timer: DisappearTimer) => void;
  burnAllData: () => void;
  signOut: () => Promise<void>;
  searchRegisteredUsers: (query: string) => Promise<Array<{ fingerprint: string; display_name: string; public_key_jwk: any }>>;
  onIncomingMessage: (handler: IncomingMessageHandler) => () => void;
  processIncomingMessages: () => Promise<void>;
  sendReadReceipt: (contactId: string) => Promise<void>;
  sendTypingIndicator: (contactId: string) => Promise<void>;
  sendCallSignal: (contactId: string, signal: Omit<CallSignal, "__type">) => Promise<void>;
  onCallSignal: (handler: CallSignalHandler) => () => void;
  /** Send a hidden, end-to-end encrypted control message to one contact. */
  sendControl: (contactId: string, body: Record<string, unknown>) => Promise<void>;
  onControlMessage: (handler: ControlMessageHandler) => () => void;
  createGroupChat: (name: string, memberIds: string[]) => Group;
  sendGroupMessage: (groupId: string, plaintext: string) => Promise<void>;
  getDecryptedGroupMessages: (groupId: string) => Promise<Array<{ id: string; text: string; fromMe: boolean; senderName: string; timestamp: number }>>;
  deleteGroupChat: (groupId: string) => void;
  drainOutbox: () => Promise<void>;
  retryFailedOutbox: () => Promise<void>;
}