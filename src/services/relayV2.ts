// Relay v2 — owner-only inboxes. Talks only to the relay_* functions in
// supabase/migrations/20261125000000_relay_v2_owner_only_inboxes.sql; the
// relay tables themselves are closed to the app.
//
//   send    anyone who knows a (secret, ECDH-derived) inbox id
//   fetch   only the inbox owner, proving their read token
//   ack     only the inbox owner — deletes delivered envelopes
//   doorbell a content-free broadcast on a topic only the owner can derive

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { InboxSecrets } from "@/crypto/relayV2";

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
// These functions aren't in the generated Supabase types yet.
const rpc = supabase.rpc.bind(supabase) as unknown as Rpc;

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface InboxEnvelope {
  id: string;
  encrypted_payload: string;
  iv: string;
  created_at: string;
}

export const registerInbox = (queueId: string, secrets: InboxSecrets) =>
  call<boolean>("relay_register_inbox", { p_queue_id: queueId, p_token_hash: secrets.tokenHash, p_topic: secrets.topic });

export const inboxReady = (queueId: string) => call<boolean>("relay_inbox_ready", { p_queue_id: queueId });

export const sendToInbox = (queueId: string, paddedPayload: string, iv: string) =>
  call<void>("relay_send", { p_queue_id: queueId, p_payload: paddedPayload, p_iv: iv });

export async function fetchInbox(queueId: string, secrets: InboxSecrets): Promise<InboxEnvelope[]> {
  return (await call<InboxEnvelope[] | null>("relay_fetch", { p_queue_id: queueId, p_token: secrets.token })) ?? [];
}

export async function ackInbox(queueId: string, secrets: InboxSecrets, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return call<number>("relay_ack", { p_queue_id: queueId, p_token: secrets.token, p_ids: ids });
}

export const deleteInbox = (queueId: string, secrets: InboxSecrets) =>
  call<boolean>("relay_delete_inbox", { p_queue_id: queueId, p_token: secrets.token });

/** Ring = "something arrived in this inbox; fetch it". The broadcast carries no data. */
export function subscribeDoorbell(
  secrets: InboxSecrets,
  onRing: () => void,
  onStatus?: (status: string) => void
): RealtimeChannel {
  return supabase
    .channel(`inbox:${secrets.topic}`, { config: { private: false, broadcast: { self: false } } })
    .on("broadcast", { event: "new" }, () => onRing())
    .subscribe((status) => onStatus?.(status));
}

export function unsubscribeDoorbell(channel: RealtimeChannel) {
  void supabase.removeChannel(channel);
}

// ─── Routing ────────────────────────────────────────────────────────────────
//
// Contacts still carry their v1 outbox id, and every send path passes that id to
// sendRelayMessage. When this phone knows the contact's v2 inbox and the
// contact's app has registered it (so it will be read), the message goes to v2
// instead. A contact on an older app keeps getting v1 until they update.

type Route = { v2: string; ready: boolean; checkedAt: number };
const routes = new Map<string, Route>();
const READY_RECHECK_MS = 60_000;

export function setOutboxRoute(v1QueueId: string, v2QueueId: string) {
  const existing = routes.get(v1QueueId);
  if (existing?.v2 === v2QueueId) return;
  routes.set(v1QueueId, { v2: v2QueueId, ready: false, checkedAt: 0 });
}

/** The v2 inbox to send to instead of `v1QueueId`, or null to use v1. */
export async function resolveOutbox(v1QueueId: string): Promise<string | null> {
  const route = routes.get(v1QueueId);
  if (!route) return null;
  if (route.ready) return route.v2;
  if (Date.now() - route.checkedAt < READY_RECHECK_MS) return null;
  route.checkedAt = Date.now();
  try {
    route.ready = await inboxReady(route.v2);
  } catch {
    route.ready = false;
  }
  return route.ready ? route.v2 : null;
}

// My own inboxes, so removal and account deletion can clear them from the server.
const myInboxes = new Map<string, { queueId: string; secrets: InboxSecrets }>();

export function rememberMyInbox(contactFingerprint: string, queueId: string, secrets: InboxSecrets) {
  myInboxes.set(contactFingerprint, { queueId, secrets });
}

export async function deleteMyInboxFor(contactFingerprint: string) {
  const inbox = myInboxes.get(contactFingerprint);
  if (!inbox) return;
  myInboxes.delete(contactFingerprint);
  await deleteInbox(inbox.queueId, inbox.secrets);
}

/** Every inbox this phone currently owns (for push registration). */
export function listMyInboxes(): { queueId: string; secrets: InboxSecrets }[] {
  return [...myInboxes.values()];
}

/** Remove every inbox this phone owns from the server (account deletion / panic wipe). */
export async function deleteAllMyInboxes() {
  const all = [...myInboxes.entries()];
  myInboxes.clear();
  routes.clear();
  await Promise.allSettled(all.map(([, inbox]) => deleteInbox(inbox.queueId, inbox.secrets)));
}
