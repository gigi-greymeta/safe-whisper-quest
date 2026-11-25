/**
 * Safety numbers, derived the way Signal derives them.
 *
 * For each person, from their long-term public key:
 *   h = SHA-512(version || publicKey)
 *   repeat 5200 times: h = SHA-512(h || publicKey)
 *   digits = first 30 bytes as six 5-byte big-endian chunks, each mod 100000 (zero-padded)
 * The conversation's number is the two 30-digit halves in sorted order: 60 digits,
 * the same on both phones, shown as 12 groups of 5.
 *
 * The 5200 iterations make each guess expensive, so an attacker can't grind
 * through keys until one produces a number that looks the same. The publicKey
 * bytes are the uncompressed P-256 point (0x04 || x || y), so the number depends
 * only on the key, never on display names or encoding details.
 */

const VERSION = new Uint8Array([0, 0]);
const ITERATIONS = 5200;

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Uncompressed P-256 point from a fingerprint (base64 of {x, y, kty, crv}). */
function publicKeyBytes(fingerprint: string): Uint8Array {
  const { x, y } = JSON.parse(atob(fingerprint.replace(/\s+/g, ""))) as { x?: string; y?: string };
  if (!x || !y) throw new Error("Not a public key fingerprint");
  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.set(base64UrlToBytes(x), 1);
  point.set(base64UrlToBytes(y), 33);
  return point;
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

async function displayableHalf(fingerprint: string): Promise<string> {
  const key = publicKeyBytes(fingerprint);
  let hash = new Uint8Array(await crypto.subtle.digest("SHA-512", concat(VERSION, key)));
  for (let i = 0; i < ITERATIONS; i++) {
    hash = new Uint8Array(await crypto.subtle.digest("SHA-512", concat(hash, key)));
  }
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) {
    let value = 0;
    for (let i = 0; i < 5; i++) value = value * 256 + hash[chunk * 5 + i];
    digits += String(value % 100000).padStart(5, "0");
  }
  return digits;
}

/** The 60-digit safety number for two identities, formatted as 12 groups of 5. */
export async function deriveSafetyNumber(myFingerprint: string, peerFingerprint: string): Promise<string> {
  const halves = (await Promise.all([displayableHalf(myFingerprint), displayableHalf(peerFingerprint)])).sort();
  return (halves.join("").match(/\d{5}/g) ?? []).join(" ");
}

/**
 * The number app versions before this change displayed (a non-cryptographic
 * hash). Used ONLY to recognise a scanned code from a not-yet-updated phone and
 * say so, instead of raising a false "keys don't match" alarm. Never shown.
 */
export function legacySafetyNumber(myFingerprint: string, peerFingerprint: string): string {
  const [a, b] = [myFingerprint, peerFingerprint].sort();
  const combined = a + "|" + b;
  let hash = 0;
  const digits: number[] = [];
  for (let round = 0; round < 60; round++) {
    const input = combined + ":" + round;
    let h = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    hash = (hash + Math.abs(h)) >>> 0;
    digits.push(hash % 10);
  }
  return digits.join("");
}
