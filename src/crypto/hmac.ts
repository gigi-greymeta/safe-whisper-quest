// HMAC-SHA256 for message authentication — detects relay tampering

export async function generateHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

export async function importHmacKey(raw: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

export async function deriveHmacKeyFromShared(sharedKeyBits: ArrayBuffer): Promise<CryptoKey> {
  // Derive an HMAC key from shared secret using HKDF
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    sharedKeyBits,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("phantom_hmac_v1"),
      info: new TextEncoder().encode("hmac-auth"),
    },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

export async function signPayload(hmacKey: CryptoKey, payload: string): Promise<string> {
  const encoded = new TextEncoder().encode(payload);
  const signature = await crypto.subtle.sign("HMAC", hmacKey, encoded);
  return arrayBufferToBase64(signature);
}

export async function verifyPayload(hmacKey: CryptoKey, payload: string, signatureB64: string): Promise<boolean> {
  const encoded = new TextEncoder().encode(payload);
  const signature = base64ToArrayBuffer(signatureB64);
  return crypto.subtle.verify("HMAC", hmacKey, signature, encoded);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
