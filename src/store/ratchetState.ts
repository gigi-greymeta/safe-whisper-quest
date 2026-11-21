/**
 * Persist Double Ratchet state per contact in localStorage.
 * Each contact has independent ratchet chains for perfect forward secrecy.
 */

import type { RatchetState } from "@/crypto/ratchet";

const RATCHET_PREFIX = "phantom_ratchet_";

export function getRatchetState(contactId: string): RatchetState | null {
  const stored = localStorage.getItem(RATCHET_PREFIX + contactId);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as RatchetState;
  } catch {
    return null;
  }
}

export function saveRatchetState(contactId: string, state: RatchetState): void {
  localStorage.setItem(RATCHET_PREFIX + contactId, JSON.stringify(state));
}

export function deleteRatchetState(contactId: string): void {
  localStorage.removeItem(RATCHET_PREFIX + contactId);
}

export function clearAllRatchetStates(): void {
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(RATCHET_PREFIX));
  keys.forEach((k) => localStorage.removeItem(k));
}
