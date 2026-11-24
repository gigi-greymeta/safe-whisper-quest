/**
 * Relay v2 addressing and inbox secrets.
 *
 * Inbox ids (v1 were SHA-256 of the two public fingerprints, so anyone could
 * compute which inbox belongs to which pair) now come from the static ECDH
 * secret between the two identity keys:
 *
 *   shared       = ECDH(myPrivate, peerPublic)               (equal on both phones)
 *   inbox(owner) = HKDF(shared, salt="phantom-relay-v2", info="inbox:" + ownerFingerprint)
 *
 * Only the two people in a conversation can compute or recognise its inboxes.
 *
 * Reading and deleting an inbox requires a token only its OWNER can derive, from
 * their private key — the peer knows the inbox id (to send) but not the token:
 *
 *   ownerKey = HKDF(privateKey.d, salt="phantom-relay-v2", info="owner")
 *   token    = HMAC(ownerKey, "read:"  + inboxId)   → 64 hex; the server stores SHA-256(token)
 *   topic    = HMAC(ownerKey, "topic:" + inboxId)   → 32 hex; doorbell broadcast channel
 *
 * Everything is deterministic, so restoring an identity from backup restores
 * access to its inboxes with nothing extra to store.
 */

const encoder = new TextEncoder();
const SALT = encoder.encode("phantom-relay-v2");

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function hkdf(ikm: BufferSource, info: string, bits = 256): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(info) }, key, bits);
}

export async function sha256Hex(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Inbox ids for the conversation between `self` and `peer`. */
export async function deriveRelayV2Queues(
  selfPrivateJwk: JsonWebKey,
  selfFingerprint: string,
  peerPublicJwk: JsonWebKey,
  peerFingerprint: string
): Promise<{ inbox: string; outbox: string }> {
  const curve = { name: "ECDH", namedCurve: "P-256" } as const;
  const privateKey = await crypto.subtle.importKey("jwk", { ...selfPrivateJwk, key_ops: ["deriveBits"] }, curve, false, ["deriveBits"]);
  const { kty, crv, x, y } = peerPublicJwk;
  const publicKey = await crypto.subtle.importKey("jwk", { kty, crv, x, y }, curve, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256);
  const [inbox, outbox] = await Promise.all([
    hkdf(shared, `inbox:${selfFingerprint}`),
    hkdf(shared, `inbox:${peerFingerprint}`),
  ]);
  return { inbox: hex(inbox), outbox: hex(outbox) };
}

export type InboxSecrets = { token: string; tokenHash: string; topic: string };

/** The owner-only read token and doorbell topic for one of my inboxes. */
export async function deriveInboxSecrets(selfPrivateJwk: JsonWebKey, inboxId: string): Promise<InboxSecrets> {
  if (!selfPrivateJwk.d) throw new Error("Private key required");
  const ownerBits = await hkdf(base64UrlToBytes(selfPrivateJwk.d), "owner");
  const ownerKey = await crypto.subtle.importKey("raw", ownerBits, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const [tokenBytes, topicBytes] = await Promise.all([
    crypto.subtle.sign("HMAC", ownerKey, encoder.encode(`read:${inboxId}`)),
    crypto.subtle.sign("HMAC", ownerKey, encoder.encode(`topic:${inboxId}`)),
  ]);
  const token = hex(tokenBytes);
  return { token, tokenHash: await sha256Hex(token), topic: hex(topicBytes).slice(0, 32) };
}
