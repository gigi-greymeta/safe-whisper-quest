// Relay service — handles sending/receiving encrypted messages via anonymous pairwise queues
// The server never knows who sent a message (SimpleX-style sender anonymization)

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createDeletionProof } from "../../supabase/functions/_shared/deletionProof.ts";

// ─── Public Key Registry ─────────────────────────────────────────────

export async function publishPublicKey(
  fingerprint: string,
  displayName: string,
  publicKeyJwk: JsonWebKey
) {
  // Registry is write-once (UPDATE policy is intentionally absent for security).
  // Use plain INSERT and treat unique-violation as success — the existing row
  // already contains this fingerprint's immutable public key.
  const { error } = await supabase
    .from("public_key_registry")
    .insert({
      fingerprint,
      display_name: displayName,
      public_key_jwk: publicKeyJwk as any,
    });

  if (error) {
    const isDup = (error as any).code === "23505" || /duplicate key/i.test(error.message);
    if (!isDup) throw new Error(`Failed to publish key: ${error.message}`);
  }

  // NOTE: We intentionally do NOT auto-archive other registry rows that share
  // this display_name. Display names are user-chosen and NOT unique identifiers
  // — two genuinely different users (or the same user on two devices) may pick
  // the same name. Archiving by name caused legitimate identities to disappear
  // from search and broke safety-number / ratchet consistency for peers that
  // had already pinned the archived key. Identities are uniquely defined by
  // their fingerprint (public key); leave dedup to the user during search.
}

export async function lookupPublicKey(fingerprint: string) {
  const { data, error } = await supabase
    .from("public_key_registry")
    .select("*")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (error) throw new Error(`Lookup failed: ${error.message}`);
  return data;
}

export async function searchUsers(query: string) {
  const { data, error } = await supabase
    .from("public_key_registry")
    .select("*")
    .ilike("display_name", `%${query}%`)
    .is("archived_at" as any, null)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(`Search failed: ${error.message}`);
  return data || [];
}

// ─── Pairwise Queues ────────────────────────────────────────────────

/**
 * Register an inbox queue on the server.
 *
 * Pass an explicit `queueId` (deterministically derived) so both peers
 * register the SAME id without coordination — eliminates the race where
 * two peers adding each other simultaneously create mismatched queues.
 *
 * Idempotent: if the row already exists (because the peer registered first)
 * the duplicate-key error is swallowed and the existing id is returned.
 */
export async function createQueue(
  ownerFingerprint: string,
  queueId?: string
): Promise<string> {
  const finalId = queueId ?? crypto.randomUUID();
  const { error } = await supabase
    .from("pairwise_queues")
    .insert({ queue_id: finalId, owner_fingerprint: ownerFingerprint });

  if (error) {
    // 23505 = unique_violation. With deterministic IDs this just means the
    // peer already registered the same queue — perfectly fine, both sides agree.
    const isDup = (error as any).code === "23505" || /duplicate key/i.test(error.message);
    if (!isDup) throw new Error(`Failed to create queue: ${error.message}`);
  }
  return finalId;
}

/** Look up all queues owned by a fingerprint */
export async function getQueuesForOwner(ownerFingerprint: string) {
  const { data, error } = await supabase
    .from("pairwise_queues")
    .select("*")
    .eq("owner_fingerprint", ownerFingerprint);

  if (error) throw new Error(`Failed to fetch queues: ${error.message}`);
  return data || [];
}

/** Delete a queue */
export async function deleteQueue(queueId: string) {
  await supabase.from("pairwise_queues").delete().eq("queue_id", queueId);
}

// ─── Message Padding (Metadata Resistance) ─────────────────────────

const PADDING_BUCKETS = [1024, 4096, 16384, 65536]; // 1KB, 4KB, 16KB, 64KB

/** Pad a payload to the next bucket size to prevent size-based traffic analysis */
function padPayload(payload: string): string {
  const targetSize = PADDING_BUCKETS.find(b => b >= payload.length + 32) || PADDING_BUCKETS[PADDING_BUCKETS.length - 1];
  const paddingLength = targetSize - payload.length - 32; // 32 chars for envelope
  if (paddingLength <= 0) return JSON.stringify({ d: payload, p: "" });
  const padding = Array.from(crypto.getRandomValues(new Uint8Array(paddingLength)))
    .map(b => String.fromCharCode(b % 94 + 33)).join("");
  return JSON.stringify({ d: payload, p: padding });
}

/** Strip padding from a received payload */
export function unpadPayload(padded: string): string {
  try {
    const parsed = JSON.parse(padded);
    if (parsed?.d !== undefined) return parsed.d;
  } catch {}
  return padded; // Not padded (legacy message)
}

// ─── Relay Messages (Anonymous + HMAC) ──────────────────────────────

/** Send an encrypted message to a queue with optional HMAC signature */
export async function sendRelayMessage(
  queueId: string,
  encryptedPayload: string,
  iv: string,
  hmacSignature?: string
) {
  // Embed HMAC in the payload envelope if provided
  const innerPayload = hmacSignature
    ? JSON.stringify({ __hmac: hmacSignature, __payload: encryptedPayload })
    : encryptedPayload;

  // Pad to standard bucket size
  const paddedPayload = padPayload(innerPayload);

  const { error } = await supabase.from("relay_messages").insert({
    queue_id: queueId,
    recipient_fingerprint: queueId,
    encrypted_payload: paddedPayload,
    iv,
  });

  if (error) throw new Error(`Failed to send relay message: ${error.message}`);
}

/** Legacy: send with sender fingerprint (for backward compatibility) */
export async function sendRelayMessageLegacy(
  senderFingerprint: string,
  recipientFingerprint: string,
  encryptedPayload: string,
  iv: string,
  hmacSignature?: string
) {
  const finalPayload = hmacSignature
    ? JSON.stringify({ __hmac: hmacSignature, __payload: encryptedPayload })
    : encryptedPayload;

  const { error } = await supabase.from("relay_messages").insert({
    sender_fingerprint: senderFingerprint,
    recipient_fingerprint: recipientFingerprint,
    encrypted_payload: finalPayload,
    iv,
  });

  if (error) throw new Error(`Failed to send relay message: ${error.message}`);
}

/**
 * Extract HMAC envelope from a relay message payload.
 * Handles unpadding for padded messages.
 * Returns the raw payload and HMAC signature if present.
 */
export function extractHmacEnvelope(rawPayload: string): { payload: string; hmac: string | null } {
  // First unpad if needed
  const unpadded = unpadPayload(rawPayload);
  try {
    const parsed = JSON.parse(unpadded);
    if (parsed?.__hmac && parsed?.__payload) {
      return { payload: parsed.__payload, hmac: parsed.__hmac };
    }
  } catch {
    // Not an HMAC envelope
  }
  return { payload: unpadded, hmac: null };
}

/** Fetch pending messages for a specific queue */
export async function fetchPendingMessagesForQueue(queueId: string) {
  const { data, error } = await supabase
    .from("relay_messages")
    .select("*")
    .eq("queue_id", queueId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return data || [];
}

/** Fetch pending messages by recipient fingerprint (legacy) */
export async function fetchPendingMessages(recipientFingerprint: string) {
  const { data, error } = await supabase
    .from("relay_messages")
    .select("*")
    .eq("recipient_fingerprint", recipientFingerprint)
    .is("queue_id", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);
  return data || [];
}

export async function deleteRelayMessage(id: string) {
  await supabase.from("relay_messages").delete().eq("id", id);
}

// ─── Real-time Subscription (Queue-based) ───────────────────────────

/** Subscribe to messages arriving on specific queue IDs (server-side filtered) */
export function subscribeToQueues(
  queueIds: string[],
  onMessage: (payload: {
    id: string;
    queue_id: string;
    encrypted_payload: string;
    iv: string;
    created_at: string;
  }) => void,
  onStatus?: (queueId: string, status: string, error?: Error) => void,
  channelSalt = ""
): RealtimeChannel[] {
  // Create separate channels per queue with server-side filtering
  // to prevent metadata leakage from receiving all relay traffic
  return queueIds.map((qid) => {
    const channel = supabase
      .channel(`queue:${qid.slice(0, 8)}${channelSalt ? `:${channelSalt}` : ""}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "relay_messages",
          filter: `queue_id=eq.${qid}`,
        },
        (payload) => {
          const row = payload.new as any;
          onMessage({
            id: row.id,
            queue_id: row.queue_id,
            encrypted_payload: row.encrypted_payload,
            iv: row.iv,
            created_at: row.created_at,
          });
        }
      )
      .subscribe((status, error) => onStatus?.(qid, status, error));
    return channel;
  });
}

/** Legacy: subscribe by recipient fingerprint */
export function subscribeToMessages(
  recipientFingerprint: string,
  onMessage: (payload: {
    id: string;
    sender_fingerprint: string;
    encrypted_payload: string;
    iv: string;
    created_at: string;
  }) => void,
  onStatus?: (status: string, error?: Error) => void,
  channelSalt = ""
): RealtimeChannel {
  const channel = supabase
    .channel(`relay:${recipientFingerprint}${channelSalt ? `:${channelSalt}` : ""}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "relay_messages",
        filter: `recipient_fingerprint=eq.${recipientFingerprint}`,
      },
      (payload) => {
        const row = payload.new as any;
        if (!row.queue_id) {
          onMessage({
            id: row.id,
            sender_fingerprint: row.sender_fingerprint || "unknown",
            encrypted_payload: row.encrypted_payload,
            iv: row.iv,
            created_at: row.created_at,
          });
        }
      }
    )
    .subscribe((status, error) => onStatus?.(status, error));

  return channel;
}

export function unsubscribeFromMessages(channel: RealtimeChannel) {
  supabase.removeChannel(channel);
}

// ─── Identity Deletion ─────────────────────────────────────────────

/**
 * Permanently delete this identity's server-side data: its public key
 * directory entry, inbox queues, and any undelivered messages addressed to or
 * (legacy path) from it. Authorised by proving possession of the private key —
 * see supabase/functions/_shared/deletionProof.ts.
 *
 * Callers must wipe local data straight afterwards: the relay republishes the
 * public key on every (re)connect.
 */
export async function deleteIdentityFromServer(
  fingerprint: string,
  privateKeyJwk: JsonWebKey
): Promise<void> {
  const { data: keyData, error: keyError } = await supabase.functions.invoke("delete-identity", { method: "GET" });
  if (keyError || !keyData?.publicKey) throw new Error("Deletion service unavailable. Check your connection and try again.");

  const timestamp = Date.now();
  const proof = await createDeletionProof(privateKeyJwk, keyData.publicKey, fingerprint, timestamp);
  const { data, error } = await supabase.functions.invoke("delete-identity", {
    body: { fingerprint, timestamp, proof },
  });
  if (error || !data?.deleted) throw new Error("Server deletion failed. Nothing was erased — try again.");
}
