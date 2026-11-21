/**
 * Track ratchet statistics per contact for forward secrecy transparency.
 * Shows users how many key rotations have occurred and when old keys were destroyed.
 */

const STATS_KEY = "phantom_ratchet_stats";

export interface RatchetStats {
  contactId: string;
  /** Total DH ratchet steps (key rotations) */
  dhRatchetCount: number;
  /** Total messages sent with unique keys */
  messageKeysSent: number;
  /** Total messages received with unique keys */
  messageKeysReceived: number;
  /** Timestamp of last DH ratchet step */
  lastRatchetAt: number | null;
  /** Number of old keys explicitly destroyed */
  keysDestroyed: number;
}

function getAllStats(): Record<string, RatchetStats> {
  const stored = localStorage.getItem(STATS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function saveAllStats(stats: Record<string, RatchetStats>): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function getStatsForContact(contactId: string): RatchetStats {
  const all = getAllStats();
  return all[contactId] || {
    contactId,
    dhRatchetCount: 0,
    messageKeysSent: 0,
    messageKeysReceived: 0,
    lastRatchetAt: null,
    keysDestroyed: 0,
  };
}

export function incrementSentKeys(contactId: string): void {
  const all = getAllStats();
  const stats = all[contactId] || getStatsForContact(contactId);
  stats.messageKeysSent++;
  all[contactId] = stats;
  saveAllStats(all);
}

export function incrementReceivedKeys(contactId: string): void {
  const all = getAllStats();
  const stats = all[contactId] || getStatsForContact(contactId);
  stats.messageKeysReceived++;
  all[contactId] = stats;
  saveAllStats(all);
}

export function recordDhRatchet(contactId: string): void {
  const all = getAllStats();
  const stats = all[contactId] || getStatsForContact(contactId);
  stats.dhRatchetCount++;
  stats.lastRatchetAt = Date.now();
  stats.keysDestroyed += 2; // Old send + recv chain keys destroyed
  all[contactId] = stats;
  saveAllStats(all);
}

export function clearRatchetStats(): void {
  localStorage.removeItem(STATS_KEY);
}

export function deleteStatsForContact(contactId: string): void {
  const all = getAllStats();
  delete all[contactId];
  saveAllStats(all);
}
