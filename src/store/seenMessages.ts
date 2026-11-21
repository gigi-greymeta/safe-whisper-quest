// Per-device cursor of which relay message IDs have been processed.
// Lets us safely STOP deleting messages from the relay (so the same message
// can be picked up later by the same user on another device, AND so an
// offline contact's later replay still works) without reprocessing them
// every reconnect.

const SEEN_KEY = "phantom_seen_relay_ids";
const MAX_SEEN = 5000;

function load(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  // Cap to prevent unbounded growth — relay messages expire after 7 days
  // server-side, so old IDs become irrelevant naturally.
  const trimmed = ids.length > MAX_SEEN ? ids.slice(-MAX_SEEN) : ids;
  localStorage.setItem(SEEN_KEY, JSON.stringify(trimmed));
}

let cache: Set<string> | null = null;

function getCache(): Set<string> {
  if (!cache) cache = new Set(load());
  return cache;
}

export function hasSeen(id: string): boolean {
  return getCache().has(id);
}

export function markSeen(id: string): void {
  const c = getCache();
  if (c.has(id)) return;
  c.add(id);
  save(Array.from(c));
}

export function clearSeen(): void {
  cache = new Set();
  localStorage.removeItem(SEEN_KEY);
}
