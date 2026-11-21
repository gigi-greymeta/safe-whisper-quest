/**
 * Deterministic pairwise queue ID derivation.
 *
 * For any two fingerprints A and B, both peers can independently compute the
 * SAME inbox/outbox queue IDs without coordinating with the server. This
 * eliminates the discoverOutboxQueue race condition: there is no "discovery"
 * — both sides just derive.
 *
 *   inbox(self, peer)  = SHA-256( sortedPair(self, peer) || ":phantom-pair-v1:inbox:"  || self )
 *   outbox(self, peer) = SHA-256( sortedPair(self, peer) || ":phantom-pair-v1:inbox:"  || peer )
 *
 * i.e. my outbox is just my peer's inbox derived with the same formula.
 *
 * Sorting the pair ensures both sides agree on the "conversation prefix"
 * regardless of who initiated. The :inbox: tag plus owner fingerprint makes
 * each owner's queue unique, so a single conversation has two distinct queues.
 */

const PROTOCOL_TAG = ":phantom-pair-v1:inbox:";

function sortedPair(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive the inbox queue ID owned by `ownerFingerprint` for the conversation
 * with `peerFingerprint`. Truncated to 32 hex chars (128 bits) to keep DB rows compact
 * — still well above birthday-collision resistance for any practical user count.
 */
export async function deriveInboxQueueId(
  ownerFingerprint: string,
  peerFingerprint: string
): Promise<string> {
  const material = `${sortedPair(ownerFingerprint, peerFingerprint)}${PROTOCOL_TAG}${ownerFingerprint}`;
  const hex = await sha256Hex(material);
  return hex.slice(0, 32);
}

/**
 * Derive my outbox queue (= peer's inbox).
 */
export async function deriveOutboxQueueId(
  selfFingerprint: string,
  peerFingerprint: string
): Promise<string> {
  return deriveInboxQueueId(peerFingerprint, selfFingerprint);
}
