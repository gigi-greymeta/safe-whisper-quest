// Cryptography for vanishing groups.
//
// Keys: the admin creates a random 256-bit chain key. Each UTC day's message key is
// derived from that day's chain key, and the next day's chain key is a one-way hash
// of today's. Members only ever keep the chain key from two days back, so a device
// seized today can't decrypt anything older than the 48-hour window, even from a copy
// of the server taken earlier (forward secrecy by the day). Removing a member replaces
// the chain key and the group address entirely.
//
// Authenticity: every message is signed with the sender's own ECDSA P-256 key for
// this group. The admin distributes everyone's public signing keys over the pairwise
// end-to-end channels, so a member can't post as someone else, and the server can't
// inject messages.
//
// Size: plaintext is padded to a multiple of 512 bytes so lengths reveal little.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_DAYS = 2;
const PAD_TO = 512;

export const currentDay = (now = Date.now()) => Math.floor(now / DAY_MS);

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
export const randomHex = (n: number) => Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, "0")).join("");

export async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function labelledHash(key: Uint8Array, label: string): Promise<Uint8Array> {
  const input = new Uint8Array(key.length + label.length);
  input.set(key);
  input.set(new TextEncoder().encode(label), key.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

/** A chain key as of `day`. */
export interface ChainState {
  key: string; // base64
  day: number;
}

export const newChain = (day = currentDay()): ChainState => ({ key: toB64(randomBytes(32)), day });

/** Chain key for a later day (one-way: earlier days can't be recovered from it). */
export async function advanceChain(chain: ChainState, toDay: number): Promise<ChainState> {
  let key = fromB64(chain.key);
  for (let d = chain.day; d < toDay; d++) key = await labelledHash(key, "phantom-vg-chain");
  return { key: toB64(key), day: Math.max(chain.day, toDay) };
}

/** Drop chain keys older than the 48-hour window. */
export async function pruneChain(chain: ChainState, today = currentDay()): Promise<ChainState> {
  const oldest = today - KEEP_DAYS;
  return chain.day < oldest ? advanceChain(chain, oldest) : chain;
}

/** Message key for `day`, or null if that day is outside what this chain can reach. */
export async function messageKey(chain: ChainState, day: number): Promise<CryptoKey | null> {
  if (day < chain.day || day > currentDay() + 1) return null;
  const dayChain = await advanceChain(chain, day);
  const raw = await labelledHash(fromB64(dayChain.key), "phantom-vg-message");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function pad(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const total = Math.ceil((body.length + 4) / PAD_TO) * PAD_TO;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, body.length);
  out.set(body, 4);
  return out;
}

function unpad(bytes: Uint8Array): string {
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
  return new TextDecoder().decode(bytes.subarray(4, 4 + len));
}

export async function encryptPayload(key: CryptoKey, text: string, aad: string): Promise<{ iv: string; payload: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, pad(text));
  return { iv: toB64(iv), payload: toB64(new Uint8Array(ct)) };
}

export async function decryptPayload(key: CryptoKey, iv: string, payload: string, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv), additionalData: new TextEncoder().encode(aad) },
    key,
    fromB64(payload)
  );
  return unpad(new Uint8Array(pt));
}

// ─── Signatures ──────────────────────────────────────────────────────

const SIGN_ALG = { name: "ECDSA", namedCurve: "P-256" } as const;

export async function newSigningKeys(): Promise<{ pub: JsonWebKey; priv: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey(SIGN_ALG, true, ["sign", "verify"]);
  return {
    pub: await crypto.subtle.exportKey("jwk", kp.publicKey),
    priv: await crypto.subtle.exportKey("jwk", kp.privateKey),
  };
}

export async function sign(priv: JsonWebKey, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", priv, SIGN_ALG, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(data));
  return toB64(new Uint8Array(sig));
}

export async function verify(pub: JsonWebKey, data: string, sig: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey("jwk", pub, SIGN_ALG, false, ["verify"]);
    return await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromB64(sig), new TextEncoder().encode(data));
  } catch {
    return false;
  }
}

// ─── Media ───────────────────────────────────────────────────────────

export const MEDIA_CHUNK = 512 * 1024;

export async function newMediaKey(): Promise<{ key: CryptoKey; raw: string }> {
  const raw = randomBytes(32);
  return { key: await importMediaKey(toB64(raw)), raw: toB64(raw) };
}

export const importMediaKey = (raw: string) => crypto.subtle.importKey("raw", fromB64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function encryptChunk(key: CryptoKey, bytes: Uint8Array, aad: string): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, bytes);
  return { iv: toB64(iv), data: toB64(new Uint8Array(ct)) };
}

export async function decryptChunk(key: CryptoKey, iv: string, data: string, aad: string): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv), additionalData: new TextEncoder().encode(aad) }, key, fromB64(data));
  return new Uint8Array(pt);
}
