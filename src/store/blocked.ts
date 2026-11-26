// People this user has blocked. Blocking removes the contact (so their messages
// stop arriving), stops them being added again until unblocked, and hides their
// posts in vanishing groups. Kept in the PIN vault (SENSITIVE_KEYS in vault.ts).

import { persistNow } from "@/store/persistNow";

const KEY = "phantom_blocked";

export interface BlockedPerson {
  fingerprint: string;
  name: string;
  blockedAt: number;
}

export function getBlocked(): BlockedPerson[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as BlockedPerson[];
  } catch {
    return [];
  }
}

export const isBlocked = (fingerprint: string) => getBlocked().some((b) => b.fingerprint === fingerprint);

export function block(fingerprint: string, name: string): void {
  if (isBlocked(fingerprint)) return;
  localStorage.setItem(KEY, JSON.stringify([...getBlocked(), { fingerprint, name, blockedAt: Date.now() }]));
  persistNow();
}

export function unblock(fingerprint: string): void {
  localStorage.setItem(KEY, JSON.stringify(getBlocked().filter((b) => b.fingerprint !== fingerprint)));
  persistNow();
}
