// Contact list management — pairwise encryption channels with anonymous queues

import { vaultGet } from "@/store/vault";
import { mirrorContactsToIDB, readContactsFromIDB, clearContactsFromIDB } from "@/store/contactsPersist";

const CONTACTS_KEY = "phantom_contacts";

let contactsMemCache: Contact[] | null = null;

function readContactsFromLocalStorage(): Contact[] {
  try {
    const stored = localStorage.getItem(CONTACTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as Contact[];
  } catch {
    return [];
  }
}

function persistContacts(contacts: Contact[]): void {
  contactsMemCache = contacts;
  void mirrorContactsToIDB(contacts);
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    // Privacy browsers may refuse writes; the in-memory cache keeps the
    // current session usable, and vault hydration can restore later.
  }
}

async function persistContactsDurable(contacts: Contact[]): Promise<void> {
  contactsMemCache = contacts;
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch {
    // Privacy browsers may refuse writes; IDB below is the durable copy.
  }
  await mirrorContactsToIDB(contacts);
}

export interface Contact {
  id: string;
  displayName: string;
  publicKey: JsonWebKey;
  publicKeyFingerprint: string;
  addedAt: number;
  lastSeen?: number;
  isOnline?: boolean;
  /** My inbox queue for receiving messages FROM this contact */
  inboxQueueId?: string;
  /** Their inbox queue where I SEND messages TO this contact */
  outboxQueueId?: string;
  /** Safety number verified */
  verified?: boolean;
}

export function getContacts(): Contact[] {
  if (contactsMemCache) return contactsMemCache;
  const contacts = readContactsFromLocalStorage();
  contactsMemCache = contacts;
  return contacts;
}

export async function restoreContactsIfMissing(): Promise<Contact[]> {
  const local = getContacts();
  const vaulted = await vaultGet(CONTACTS_KEY).catch(() => null);
  const vaultedContacts = vaulted ? (() => {
    try { return JSON.parse(vaulted) as Contact[]; } catch { return []; }
  })() : [];
  const fromIdb = await readContactsFromIDB() ?? [];

  const byFingerprint = new Map<string, Contact>();
  for (const contact of [...vaultedContacts, ...fromIdb, ...local]) {
    const existing = byFingerprint.get(contact.publicKeyFingerprint);
    byFingerprint.set(contact.publicKeyFingerprint, existing ? { ...existing, ...contact } : contact);
  }
  const merged = Array.from(byFingerprint.values());
  if (merged.length > 0 || local.length > 0 || vaultedContacts.length > 0 || fromIdb.length > 0) {
    persistContacts(merged);
    return merged;
  }
  return [];
}

export function addContact(contact: Omit<Contact, "id" | "addedAt">): Contact {
  const contacts = getContacts();
  const newContact: Contact = {
    ...contact,
    id: crypto.randomUUID(),
    addedAt: Date.now(),
  };
  contacts.push(newContact);
  persistContacts(contacts);
  return newContact;
}

export async function addContactDurable(contact: Omit<Contact, "id" | "addedAt">): Promise<Contact> {
  const contacts = getContacts();
  const newContact: Contact = {
    ...contact,
    id: crypto.randomUUID(),
    addedAt: Date.now(),
  };
  await persistContactsDurable([...contacts, newContact]);
  return newContact;
}

export function updateContact(id: string, updates: Partial<Contact>): void {
  const contacts = getContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx !== -1) {
    contacts[idx] = { ...contacts[idx], ...updates };
    persistContacts(contacts);
  }
}

export async function updateContactDurable(id: string, updates: Partial<Contact>): Promise<Contact | null> {
  const contacts = getContacts();
  const idx = contacts.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const next = contacts.map((c, i) => i === idx ? { ...c, ...updates } : c);
  await persistContactsDurable(next);
  return next[idx];
}

export function removeContact(id: string): void {
  const contacts = getContacts().filter((c) => c.id !== id);
  persistContacts(contacts);
}

export function getContact(id: string): Contact | undefined {
  return getContacts().find((c) => c.id === id);
}

export function clearContacts(): void {
  contactsMemCache = null;
  void clearContactsFromIDB();
  try {
    localStorage.removeItem(CONTACTS_KEY);
  } catch {}
}
