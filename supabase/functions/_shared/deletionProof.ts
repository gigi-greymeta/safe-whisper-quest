// Proof-of-possession for identity deletion.
//
// Phantom has no accounts: an identity IS its ECDH P-256 keypair, and its
// fingerprint is base64(JSON{x,y,kty,crv}) of the public key. To delete an
// identity's server-side data, the client proves it holds the private key:
//
//   shared   = ECDH(identityPrivate, serverPublic)          (client)
//            = ECDH(serverPrivate,   identityPublic)        (server)
//   macKey   = HKDF-SHA256(shared, info = PROOF_INFO)
//   proof    = HMAC-SHA256(macKey, "PROOF_INFO|fingerprint|timestamp")
//
// The server derives identityPublic from the fingerprint itself, so no lookup
// is needed and nobody without the private key can produce a valid proof.
//
// Pure WebCrypto, no imports — shared verbatim by the browser client and the
// `delete-identity` Edge Function (Deno).

export const PROOF_INFO = "phantom-delete-identity-v1";
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

const enc = new TextEncoder();

function toBase64(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Recover the identity public key from its fingerprint. Throws if malformed. */
export function publicJwkFromFingerprint(fingerprint: string): JsonWebKey {
  const parsed = JSON.parse(atob(fingerprint));
  if (parsed?.kty !== "EC" || parsed?.crv !== "P-256" || typeof parsed.x !== "string" || typeof parsed.y !== "string") {
    throw new Error("Malformed fingerprint");
  }
  return { kty: "EC", crv: "P-256", x: parsed.x, y: parsed.y };
}

function proofMessage(fingerprint: string, timestamp: number): Uint8Array {
  return enc.encode(`${PROOF_INFO}|${fingerprint}|${timestamp}`);
}

async function deriveMacKey(privateJwk: JsonWebKey, publicJwk: JsonWebKey): Promise<CryptoKey> {
  const ecdh = { name: "ECDH", namedCurve: "P-256" };
  const priv = await crypto.subtle.importKey("jwk", privateJwk, ecdh, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("jwk", publicJwk, ecdh, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(PROOF_INFO) },
    hkdfKey,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["sign", "verify"],
  );
}

/** Client side: prove possession of the identity private key. */
export async function createDeletionProof(
  identityPrivateJwk: JsonWebKey,
  serverPublicJwk: JsonWebKey,
  fingerprint: string,
  timestamp: number,
): Promise<string> {
  const macKey = await deriveMacKey(identityPrivateJwk, serverPublicJwk);
  return toBase64(await crypto.subtle.sign("HMAC", macKey, proofMessage(fingerprint, timestamp)));
}

/** Server side: verify a deletion proof. Constant-time via WebCrypto verify. */
export async function verifyDeletionProof(
  serverPrivateJwk: JsonWebKey,
  fingerprint: string,
  timestamp: number,
  proof: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > MAX_CLOCK_SKEW_MS) return false;
  let identityPublic: JsonWebKey;
  let sig: Uint8Array;
  try {
    identityPublic = publicJwkFromFingerprint(fingerprint);
    sig = fromBase64(proof);
  } catch {
    return false;
  }
  try {
    const macKey = await deriveMacKey(serverPrivateJwk, identityPublic);
    return await crypto.subtle.verify("HMAC", macKey, sig, proofMessage(fingerprint, timestamp));
  } catch {
    // Invalid curve point etc.
    return false;
  }
}
