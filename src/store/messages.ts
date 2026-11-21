// Encrypted message storage — messages stored with an outer forward-secure
// epoch-key layer wrapping the transport ciphertext (shared-key or ratchet).
// When an epoch key is purged, those messages become permanently unreadable
// even if the device is later compromised.

import { epochEncrypt, epochDecrypt } from "@/crypto/epochKeys";

const MESSAGES_KEY = "phantom_messages";

export type DisappearTimer = "off" | "30s" | "5m" | "1h" | "24h";

export interface StoredMessage {
  id: string;
  contactId: string;
  /** Outer epoch-encrypted blob containing the inner transport {ciphertext, iv} JSON. */
  ciphertext: string;
  /** IV for the outer epoch layer. */
  iv: string;
  /** Epoch id used for the outer layer. Absent => legacy unwrapped storage. */
  epochId?: number;
  timestamp: number;
  fromMe: boolean;
  status: "sent" | "delivered" | "read";
  disappearAt?: number;
  hmacVerified?: boolean | null;
}

function getDisappearMs(timer: DisappearTimer): number | null {
  switch (timer) {
    case "30s": return 30_000;
    case "5m": return 5 * 60_000;
    case "1h": return 60 * 60_000;
    case "24h": return 24 * 60 * 60_000;
    default: return null;
  }
}

export function getAllMessages(): StoredMessage[] {
  const stored = localStorage.getItem(MESSAGES_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored) as StoredMessage[];
  } catch {
    return [];
  }
}

export function getMessagesForContact(contactId: string): StoredMessage[] {
  return getAllMessages()
    .filter((m) => m.contactId === contactId)
    .filter((m) => !m.disappearAt || m.disappearAt > Date.now());
}

/**
 * Unwrap a stored message's outer epoch layer to recover the inner
 * transport {ciphertext, iv}. Returns null if the epoch key has been
 * purged (forward secrecy: message is gone forever).
 */
export async function unwrapStoredMessage(
  msg: StoredMessage
): Promise<{ ciphertext: string; iv: string } | null> {
  // Legacy messages stored before epoch wrapping: fields are the transport blob directly.
  if (msg.epochId === undefined) {
    return { ciphertext: msg.ciphertext, iv: msg.iv };
  }
  const inner = await epochDecrypt(msg.ciphertext, msg.iv, msg.timestamp);
  if (!inner) return null;
  try {
    return JSON.parse(inner) as { ciphertext: string; iv: string };
  } catch {
    return null;
  }
}

export async function saveMessage(
  contactId: string,
  ciphertext: string,
  iv: string,
  fromMe: boolean,
  disappearTimer: DisappearTimer = "off",
  hmacVerified?: boolean | null
): Promise<StoredMessage> {
  const messages = getAllMessages();
  const disappearMs = getDisappearMs(disappearTimer);

  // Wrap the transport ciphertext+iv with the current epoch key so local
  // storage is forward-secure: deletion of the epoch key renders this row
  // permanently unreadable.
  const wrapped = await epochEncrypt(JSON.stringify({ ciphertext, iv }));

  const msg: StoredMessage = {
    id: crypto.randomUUID(),
    contactId,
    ciphertext: wrapped.ciphertext,
    iv: wrapped.iv,
    epochId: wrapped.epochId,
    timestamp: Date.now(),
    fromMe,
    status: "sent",
    disappearAt: disappearMs ? Date.now() + disappearMs : undefined,
    hmacVerified: hmacVerified ?? undefined,
  };

  messages.push(msg);
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
  return msg;
}

export function deleteMessagesForContact(contactId: string): void {
  const messages = getAllMessages().filter((m) => m.contactId !== contactId);
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}

export function clearAllMessages(): void {
  localStorage.removeItem(MESSAGES_KEY);
}

/** Mark all incoming messages from a contact as read */
export function markMessagesAsRead(contactId: string): string[] {
  const messages = getAllMessages();
  const updatedIds: string[] = [];
  const updated = messages.map((m) => {
    if (m.contactId === contactId && !m.fromMe && m.status !== "read") {
      updatedIds.push(m.id);
      return { ...m, status: "read" as const };
    }
    return m;
  });
  if (updatedIds.length > 0) {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(updated));
  }
  return updatedIds;
}

/** Mark outgoing messages to a contact as read (receipt received) */
export function markOutgoingAsRead(contactId: string): void {
  const messages = getAllMessages();
  const updated = messages.map((m) => {
    if (m.contactId === contactId && m.fromMe && m.status !== "read") {
      return { ...m, status: "read" as const };
    }
    return m;
  });
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(updated));
}

export function purgeExpiredMessages(): void {
  const now = Date.now();
  const messages = getAllMessages().filter(
    (m) => !m.disappearAt || m.disappearAt > now
  );
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
}
