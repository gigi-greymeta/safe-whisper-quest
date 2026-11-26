// Message requests waiting for an answer, and when we last asked each person.
// Kept in the PIN vault (SENSITIVE_KEYS in vault.ts).

import type { RequestBody } from "@/lib/requests";
import { persistNow } from "@/store/persistNow";

const KEY = "phantom_message_requests";
const SENT_KEY = "phantom_requests_sent";

export interface PendingRequest {
  id: string;
  from: string;
  body: RequestBody;
  receivedAt: number;
}

const listeners = new Set<() => void>();
export const onRequestsChange = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function getRequests(): PendingRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as PendingRequest[];
  } catch {
    return [];
  }
}

function save(list: PendingRequest[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  persistNow();
  listeners.forEach((l) => l());
}

const sameRequest = (a: PendingRequest, b: Omit<PendingRequest, "id" | "receivedAt">) =>
  a.from === b.from && a.body.t === b.body.t && ("groupId" in a.body ? a.body.groupId : "") === ("groupId" in b.body ? b.body.groupId : "");

/** Add (or refresh, e.g. a newer preview) a request. Returns true if it's new. */
export function addRequest(req: Omit<PendingRequest, "id" | "receivedAt">): boolean {
  const list = getRequests();
  const existing = list.find((r) => sameRequest(r, req));
  if (existing) {
    save(list.map((r) => (r === existing ? { ...r, body: req.body, receivedAt: Date.now() } : r)));
    return false;
  }
  save([...list, { ...req, id: crypto.randomUUID(), receivedAt: Date.now() }]);
  return true;
}

export function removeRequest(id: string): void {
  save(getRequests().filter((r) => r.id !== id));
}

/** Requests are re-sent at most this often to someone who hasn't answered. */
export const RESEND_AFTER_MS = 6 * 60 * 60 * 1000;

export function lastRequestSentAt(fingerprint: string): number {
  try {
    return (JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, number>)[fingerprint] ?? 0;
  } catch {
    return 0;
  }
}

export function markRequestSent(fingerprint: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(SENT_KEY) ?? "{}") as Record<string, number>;
    map[fingerprint] = Date.now();
    localStorage.setItem(SENT_KEY, JSON.stringify(map));
  } catch {
    // Storage blocked: we may send an extra request, which is harmless.
  }
}
