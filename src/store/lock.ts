// PIN/passphrase hashing with PBKDF2 key-stretching, panic wipe support, brute-force rate limiting

export type AuthMode = "pin" | "passphrase";

// New locks are numeric PINs: the calculator disguise unlocks by typing the PIN on
// its keypad, and the notes disguise by a note titled with it, so letters never work.
// "passphrase" remains only so locks created before this still open.
export const MIN_PIN_LENGTH = 4;
export const MAX_PIN_LENGTH = 12;

const AUTH_MODE_KEY = "phantom_auth_mode";
const PIN_HASH_KEY = "phantom_pin_hash";
const PIN_SALT_KEY = "phantom_pin_salt";
const LOCK_ENABLED_KEY = "phantom_lock_enabled";
const LAST_UNLOCK_KEY = "phantom_last_unlock";
const PANIC_HASH_KEY = "phantom_panic_hash";
const PANIC_SALT_KEY = "phantom_panic_salt";
const PANIC_WIPE_KEY = "phantom_panic_wipe_key";
const NOTEPAD_HASH_KEY = "phantom_notepad_pin_hash";
const NOTEPAD_SALT_KEY = "phantom_notepad_pin_salt";
const FAILED_ATTEMPTS_KEY = "phantom_failed_attempts";
const LOCKOUT_UNTIL_KEY = "phantom_lockout_until";

const MAX_ATTEMPTS_BEFORE_LOCKOUT = 5;
const LOCKOUT_DURATIONS_MS = [30_000, 60_000, 300_000, 900_000, 3600_000]; // 30s, 1m, 5m, 15m, 1h
const KDF_VERSION_KEY = "phantom_kdf_version";

// Use Argon2id when available, fall back to PBKDF2 for legacy hashes.
// We race the WASM-backed Argon2 derivation against an 8s timeout so that
// browsers which block/stall WebAssembly (some mobile browsers, privacy
// browsers, slow networks) never leave the unlock screen hanging forever.
const ARGON2_TIMEOUT_MS = 8000;

async function deriveKey(pin: string, salt: Uint8Array): Promise<string> {
  try {
    const argon2Promise = (async () => {
      const { deriveKeyWithArgon2id } = await import("@/crypto/argon2");
      return await deriveKeyWithArgon2id(pin, salt);
    })();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("argon2-timeout")), ARGON2_TIMEOUT_MS)
    );
    return await Promise.race([argon2Promise, timeoutPromise]);
  } catch (err) {
    // Fallback to PBKDF2 if WASM fails to load, is blocked, or times out.
    if (typeof console !== "undefined") {
      console.warn("[lock] Argon2 unavailable, falling back to PBKDF2:", (err as Error)?.message);
    }
    return deriveKeyWithPbkdf2Fallback(pin, salt);
  }
}

function setKdfVersion(version: "argon2id" | "pbkdf2"): void {
  localStorage.setItem(KDF_VERSION_KEY, version);
}

function getKdfVersion(): "argon2id" | "pbkdf2" {
  return (localStorage.getItem(KDF_VERSION_KEY) as "argon2id" | "pbkdf2") || "pbkdf2";
}

async function deriveKeyWithPbkdf2Fallback(pin: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  const bytes = new Uint8Array(derived);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = "";
  arr.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Rate Limiting ──────────────────────────────────────────────────

function getFailedAttempts(): number {
  return parseInt(localStorage.getItem(FAILED_ATTEMPTS_KEY) || "0", 10);
}

function getLockoutUntil(): number {
  return parseInt(localStorage.getItem(LOCKOUT_UNTIL_KEY) || "0", 10);
}

export function isLockedOut(): { locked: boolean; remainingMs: number } {
  const until = getLockoutUntil();
  const now = Date.now();
  if (until > now) {
    return { locked: true, remainingMs: until - now };
  }
  return { locked: false, remainingMs: 0 };
}

function recordFailedAttempt(): void {
  const attempts = getFailedAttempts() + 1;
  localStorage.setItem(FAILED_ATTEMPTS_KEY, attempts.toString());

  if (attempts >= MAX_ATTEMPTS_BEFORE_LOCKOUT) {
    const lockoutIndex = Math.min(
      Math.floor((attempts - MAX_ATTEMPTS_BEFORE_LOCKOUT) / MAX_ATTEMPTS_BEFORE_LOCKOUT),
      LOCKOUT_DURATIONS_MS.length - 1
    );
    const duration = LOCKOUT_DURATIONS_MS[lockoutIndex];
    localStorage.setItem(LOCKOUT_UNTIL_KEY, (Date.now() + duration).toString());
  }
}

function resetFailedAttempts(): void {
  localStorage.removeItem(FAILED_ATTEMPTS_KEY);
  localStorage.removeItem(LOCKOUT_UNTIL_KEY);
}

// ─── Auth Mode ──────────────────────────────────────────────────────

export function getAuthMode(): AuthMode {
  return (localStorage.getItem(AUTH_MODE_KEY) as AuthMode) || "pin";
}

export function setAuthMode(mode: AuthMode): void {
  localStorage.setItem(AUTH_MODE_KEY, mode);
}

// ─── Main PIN / Passphrase ──────────────────────────────────────────

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${MIN_PIN_LENGTH},${MAX_PIN_LENGTH}}$`).test(pin);
}

export async function setPin(pin: string, mode: AuthMode = "pin"): Promise<void> {
  if (mode === "pin" && !isValidPin(pin)) throw new Error(`PIN must be ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits`);
  const salt = generateSalt();
  const hashed = await deriveKey(pin, salt);
  localStorage.setItem(PIN_SALT_KEY, uint8ToBase64(salt));
  localStorage.setItem(PIN_HASH_KEY, hashed);
  localStorage.setItem(LOCK_ENABLED_KEY, "true");
  setKdfVersion("argon2id");
  setAuthMode(mode);
  resetFailedAttempts();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const { locked } = isLockedOut();
  if (locked) return false;

  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const storedSalt = localStorage.getItem(PIN_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  const salt = base64ToUint8(storedSalt);
  const hashed = await deriveKey(pin, salt);
  const valid = hashed === storedHash;

  if (valid) {
    resetFailedAttempts();
  } else {
    recordFailedAttempt();
  }

  return valid;
}

/**
 * Check a candidate against the app PIN without counting a failure toward the
 * lockout. For the decoy notepad, where every new note title is checked and most
 * are just ordinary notes.
 */
export async function matchesPinQuietly(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(PIN_HASH_KEY);
  const storedSalt = localStorage.getItem(PIN_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  return (await deriveKey(pin, base64ToUint8(storedSalt))) === storedHash;
}

// ─── Panic PIN ──────────────────────────────────────────────────────

export interface PanicWipeIdentity {
  fingerprint: string;
  privateKey: JsonWebKey;
}

/**
 * Set the Sentry Mode decoy credential. When `identity` is given, a copy of its
 * private key is sealed under the panic credential, so a wipe triggered at the
 * lock screen (vault still locked) can still prove ownership to the server and
 * delete the account there. The copy is erased with everything else on wipe.
 */
export async function setPanicPin(pin: string, identity?: PanicWipeIdentity): Promise<void> {
  if (!isValidPin(pin)) throw new Error(`Sentry PIN must be ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digits`);
  const salt = generateSalt();
  const hashed = await deriveKey(pin, salt);
  localStorage.setItem(PANIC_SALT_KEY, uint8ToBase64(salt));
  localStorage.setItem(PANIC_HASH_KEY, hashed);
  localStorage.removeItem(PANIC_WIPE_KEY);
  if (identity) {
    const keySalt = generateSalt();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await panicSealKey(pin, keySalt);
    const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(identity)));
    localStorage.setItem(
      PANIC_WIPE_KEY,
      JSON.stringify({ salt: uint8ToBase64(keySalt), iv: uint8ToBase64(iv), data: uint8ToBase64(new Uint8Array(sealed)) })
    );
  }
}

/** AES key for the sealed identity: a separate KDF run (own salt) from the stored verifier hash. */
async function panicSealKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const derived = await deriveKey(pin, salt);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(derived));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Recover the sealed identity with the panic credential; null if none was sealed. */
export async function openPanicWipeIdentity(pin: string): Promise<PanicWipeIdentity | null> {
  const raw = localStorage.getItem(PANIC_WIPE_KEY);
  if (!raw) return null;
  try {
    const { salt, iv, data } = JSON.parse(raw) as { salt: string; iv: string; data: string };
    const key = await panicSealKey(pin, base64ToUint8(salt));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToUint8(iv) }, key, base64ToUint8(data));
    return JSON.parse(new TextDecoder().decode(plain)) as PanicWipeIdentity;
  } catch {
    return null;
  }
}

export async function verifyPanicPin(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(PANIC_HASH_KEY);
  const storedSalt = localStorage.getItem(PANIC_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  const salt = base64ToUint8(storedSalt);
  const hashed = await deriveKey(pin, salt);
  return hashed === storedHash;
}

export function hasPanicPin(): boolean {
  return !!localStorage.getItem(PANIC_HASH_KEY);
}

export function removePanicPin(): void {
  localStorage.removeItem(PANIC_HASH_KEY);
  localStorage.removeItem(PANIC_SALT_KEY);
  secureEraseKey(PANIC_WIPE_KEY);
}

// ─── Notepad PIN (optional, separate from the app PIN) ──────────────

export async function setNotepadPin(pin: string): Promise<void> {
  const salt = generateSalt();
  const hashed = await deriveKey(pin, salt);
  localStorage.setItem(NOTEPAD_SALT_KEY, uint8ToBase64(salt));
  localStorage.setItem(NOTEPAD_HASH_KEY, hashed);
}

export async function verifyNotepadPin(pin: string): Promise<boolean> {
  const storedHash = localStorage.getItem(NOTEPAD_HASH_KEY);
  const storedSalt = localStorage.getItem(NOTEPAD_SALT_KEY);
  if (!storedHash || !storedSalt) return false;
  return (await deriveKey(pin, base64ToUint8(storedSalt))) === storedHash;
}

export function hasNotepadPin(): boolean {
  return !!localStorage.getItem(NOTEPAD_HASH_KEY);
}

export function removeNotepadPin(): void {
  secureEraseKey(NOTEPAD_HASH_KEY);
  secureEraseKey(NOTEPAD_SALT_KEY);
}

// ─── Secure Erase ───────────────────────────────────────────────────

/** Overwrite a localStorage key with random data before removing it */
function secureEraseKey(key: string): void {
  const current = localStorage.getItem(key);
  if (current !== null) {
    // Overwrite with random data of equal or greater length
    const overwrite = Array.from(
      crypto.getRandomValues(new Uint8Array(Math.max(current.length, 64)))
    ).map(b => String.fromCharCode(b % 94 + 33)).join("");
    localStorage.setItem(key, overwrite);
    // Second overwrite with zeros
    localStorage.setItem(key, "\0".repeat(overwrite.length));
    localStorage.removeItem(key);
  }
}

/** Securely erase all phantom_ prefixed data */
export function secureEraseAll(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("phantom_") || key?.startsWith("phantom_vault_")) {
      keys.push(key);
    }
  }
  keys.forEach(secureEraseKey);
}

// ─── Utilities ──────────────────────────────────────────────────────

export function isLockEnabled(): boolean {
  return localStorage.getItem(LOCK_ENABLED_KEY) === "true";
}

export function disableLock(): void {
  secureEraseKey(PIN_HASH_KEY);
  secureEraseKey(PIN_SALT_KEY);
  localStorage.removeItem(LOCK_ENABLED_KEY);
  localStorage.removeItem(LAST_UNLOCK_KEY);
  resetFailedAttempts();
  removePanicPin();
}

export function recordUnlock(): void {
  localStorage.setItem(LAST_UNLOCK_KEY, Date.now().toString());
}

export function getLastUnlock(): number {
  const val = localStorage.getItem(LAST_UNLOCK_KEY);
  return val ? parseInt(val, 10) : 0;
}

export function removeAllLockData(): void {
  disableLock();
}
