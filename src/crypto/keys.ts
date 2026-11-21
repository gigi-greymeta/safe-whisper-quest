// Key generation and ECDH key exchange using Web Crypto API

export interface KeyPairData {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
}

export async function generateIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function exportKeyPair(keyPair: CryptoKeyPair): Promise<KeyPairData> {
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);
  return { publicKey, privateKey };
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export function publicKeyToBase64(jwk: JsonWebKey): string {
  return btoa(JSON.stringify({ x: jwk.x, y: jwk.y, kty: jwk.kty, crv: jwk.crv }));
}

export function base64ToPublicKey(b64: string): JsonWebKey {
  // Sanitize: strip whitespace, smart quotes, and surrounding chars users
  // commonly introduce when copy-pasting between apps (iOS, terminal, etc.)
  const cleaned = b64
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[\u201C\u201D\u2018\u2019"']/g, "");
  const parsed = JSON.parse(atob(cleaned));
  return { ...parsed, key_ops: [], ext: true };
}

/**
 * Generate ephemeral key pair with non-extractable private key.
 * This prevents XSS from exfiltrating ephemeral ratchet keys.
 * The public key remains extractable for transmission.
 */
export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // non-extractable — private key cannot be exported
    ["deriveKey", "deriveBits"]
  );
}

/**
 * Generate an extractable ephemeral key pair (for serialization needs).
 * Use only when the key must be persisted (e.g., ratchet state storage).
 */
export async function generateExtractableEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}
