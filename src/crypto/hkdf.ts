// HKDF (HMAC-based Key Derivation Function) for Double Ratchet key chains

const encoder = new TextEncoder();

/**
 * Import raw key material as an HMAC key for HKDF extract step
 */
async function importHmacKey(keyMaterial: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(keyMaterial),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * HKDF-Extract: PRK = HMAC-SHA256(salt, IKM)
 */
async function hkdfExtract(salt: ArrayBuffer, ikm: ArrayBuffer): Promise<ArrayBuffer> {
  const saltBytes = salt.byteLength > 0 ? new Uint8Array(salt) : new Uint8Array(32);
  const key = await importHmacKey(saltBytes.buffer as ArrayBuffer);
  return crypto.subtle.sign("HMAC", key, ikm);
}

/**
 * HKDF-Expand: OKM = first `length` bytes of T(1) || T(2) || ...
 * where T(i) = HMAC-SHA256(PRK, T(i-1) || info || i)
 */
async function hkdfExpand(prk: ArrayBuffer, info: ArrayBuffer, length: number): Promise<ArrayBuffer> {
  const key = await importHmacKey(prk);
  const hashLen = 32; // SHA-256
  const n = Math.ceil(length / hashLen);
  const okm = new Uint8Array(n * hashLen);
  let prev = new Uint8Array(0);

  for (let i = 1; i <= n; i++) {
    const input = new Uint8Array(prev.length + info.byteLength + 1);
    input.set(prev, 0);
    input.set(new Uint8Array(info), prev.length);
    input[input.length - 1] = i;
    const t = new Uint8Array(await crypto.subtle.sign("HMAC", key, input));
    okm.set(t, (i - 1) * hashLen);
    prev = t;
  }

  return okm.slice(0, length).buffer;
}

/**
 * Derive two 32-byte keys from root key + DH output.
 * Returns [newRootKey, chainKey]
 */
export async function kdfRootKey(
  rootKey: ArrayBuffer,
  dhOutput: ArrayBuffer
): Promise<[ArrayBuffer, ArrayBuffer]> {
  const prk = await hkdfExtract(rootKey, dhOutput);
  const output = await hkdfExpand(prk, encoder.encode("PhantomRatchetRK").buffer, 64);
  const arr = new Uint8Array(output);
  return [
    arr.slice(0, 32).buffer,
    arr.slice(32, 64).buffer,
  ];
}

/**
 * Derive next chain key and message key from current chain key.
 * Returns [nextChainKey, messageKey]
 */
export async function kdfChainKey(
  chainKey: ArrayBuffer
): Promise<[ArrayBuffer, ArrayBuffer]> {
  const hmacKey = await importHmacKey(chainKey);
  const nextChainKey = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode("\x01"));
  const messageKey = await crypto.subtle.sign("HMAC", hmacKey, encoder.encode("\x02"));
  return [nextChainKey, messageKey];
}

/**
 * Import raw bytes as AES-GCM key for message encryption
 */
export async function importMessageKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ─── Serialization helpers ──────────────────────────────────────────

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
