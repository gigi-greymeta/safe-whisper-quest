import { isWiping } from "@/store/wipeGuard";
// Encrypted localStorage vault
// Sensitive keys (identity, contacts, messages, ratchet states) are encrypted at rest
// using an AES-256-GCM key derived from the user's PIN via PBKDF2.

const VAULT_PREFIX = "phantom_vault_";
const VAULT_KEY_CHECK = "phantom_vault_check";
const VAULT_MIGRATED = "phantom_vault_migrated";
const VAULT_SALT_KEY = "phantom_vault_salt";
const VAULT_KDF_VERSION_KEY = "phantom_vault_kdf_version";
const LEGACY_STATIC_SALT = "phantom_vault_salt_v1";

// Sensitive localStorage keys that should be migrated into the vault
const SENSITIVE_KEYS = [
  "phantom_identity",
  "phantom_contacts",
  "phantom_messages",
  "phantom_ratchet_states",
  "phantom_groups",
  "phantom_group_messages",
  "phantom_pinned_keys",
  "phantom_disappear_timer",
  "phantom_seen_relay_ids",
  "phantom_ratchet_stats",
  "phantom_secure_notes",
  "phantom_vanishing_groups",
  "phantom_blocked",
  "phantom_message_requests",
  "phantom_requests_sent",
];

let vaultKey: CryptoKey | null = null;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function bytesToBase64(arr: Uint8Array): string {
  let bin = "";
  arr.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function getOrCreateVaultSalt(): Uint8Array {
  const existing = localStorage.getItem(VAULT_SALT_KEY);
  if (existing) return base64ToBytes(existing);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(VAULT_SALT_KEY, bytesToBase64(salt));
  return salt;
}

async function deriveRawKeyArgon2id(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const { deriveKeyWithArgon2id } = await import("@/crypto/argon2");
  const hex = await deriveKeyWithArgon2id(pin, salt);
  return hexToBytes(hex);
}

async function deriveRawKeyPbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    km,
    256
  );
  return new Uint8Array(bits);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    raw as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Try to derive a vault key for the legacy static-salt PBKDF2 scheme.
 * Used only during migration of existing vaults created before random salts.
 */
async function deriveLegacyVaultKey(pin: string): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(LEGACY_STATIC_SALT);
  const raw = await deriveRawKeyPbkdf2(pin, salt, 100_000);
  return importAesKey(raw);
}
/**
 * Derive an AES-256-GCM key from the user's PIN for encrypting localStorage.
 */
/**
 * Derive the vault AES-256-GCM key from the user's PIN/passphrase.
 *
 * Uses a random per-user 16-byte salt stored at `phantom_vault_salt` plus
 * Argon2id (memory-hard) when available, falling back to PBKDF2-SHA-256 at
 * 600k iterations. This defeats precomputed/rainbow attacks against stolen
 * vaults — every device's key is unique even for identical PINs.
 */
export async function deriveVaultKey(pin: string): Promise<CryptoKey> {
  const salt = getOrCreateVaultSalt();
  let raw: Uint8Array;
  try {
    raw = await deriveRawKeyArgon2id(pin, salt);
    localStorage.setItem(VAULT_KDF_VERSION_KEY, "argon2id");
  } catch {
    raw = await deriveRawKeyPbkdf2(pin, salt, 600_000);
    localStorage.setItem(VAULT_KDF_VERSION_KEY, "pbkdf2-600k");
  }
  const key = await importAesKey(raw);
  raw.fill(0);
  vaultKey = key;
  return key;
}

/**
 * Store a verification token so we can verify the vault key on unlock.
 */
export async function initVault(pin: string): Promise<void> {
  // Fresh init: always start with a brand-new random salt.
  localStorage.removeItem(VAULT_SALT_KEY);
  const key = await deriveVaultKey(pin);
  const check = await encryptVaultData(key, "phantom_vault_ok");
  localStorage.setItem(VAULT_KEY_CHECK, check);
  // Migrate existing plaintext data into the vault
  await migrateToVault();
}

/**
 * Migrate existing plaintext localStorage data into the encrypted vault.
 * Only runs once — sets a flag after completion.
 */
async function migrateToVault(): Promise<void> {
  if (!vaultKey) return;
  if (localStorage.getItem(VAULT_MIGRATED) === "true") return;

  for (const key of SENSITIVE_KEYS) {
    const plaintext = localStorage.getItem(key);
    if (plaintext) {
      const encrypted = await encryptVaultData(vaultKey, plaintext);
      localStorage.setItem(VAULT_PREFIX + key, encrypted);
      // Remove the plaintext version
      localStorage.removeItem(key);
    }
  }

  // Also migrate any message keys (phantom_messages_*)
  const allKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && !k.startsWith(VAULT_PREFIX) && (
      k.startsWith("phantom_messages_") ||
      k.startsWith("phantom_ratchet_") ||
      k.startsWith("phantom_group_messages_")
    )) {
      allKeys.push(k);
    }
  }
  for (const key of allKeys) {
    const plaintext = localStorage.getItem(key);
    if (plaintext) {
      const encrypted = await encryptVaultData(vaultKey, plaintext);
      localStorage.setItem(VAULT_PREFIX + key, encrypted);
      localStorage.removeItem(key);
    }
  }

  localStorage.setItem(VAULT_MIGRATED, "true");
}

/**
 * Verify the vault key is correct by decrypting the check token.
 */
export async function unlockVault(pin: string): Promise<boolean> {
  const check = localStorage.getItem(VAULT_KEY_CHECK);
  if (!check) {
    // No vault yet — first time. Establish key (creates random salt).
    await deriveVaultKey(pin);
    return true;
  }

  const hasRandomSalt = !!localStorage.getItem(VAULT_SALT_KEY);

  // Fast path: try the current (random-salt) key.
  if (hasRandomSalt) {
    try {
      const key = await deriveVaultKey(pin);
      const decrypted = await decryptVaultData(key, check);
      if (decrypted === "phantom_vault_ok") return true;
    } catch {
      // fall through
    }
    vaultKey = null;
    return false;
  }

  // Legacy path: no random salt stored ⇒ this vault was created with the
  // hardcoded static salt + PBKDF2. Try to unlock with the legacy scheme,
  // and on success transparently re-encrypt everything under a fresh
  // random-salt Argon2id key.
  let legacyKey: CryptoKey;
  try {
    legacyKey = await deriveLegacyVaultKey(pin);
    const decrypted = await decryptVaultData(legacyKey, check);
    if (decrypted !== "phantom_vault_ok") {
      vaultKey = null;
      return false;
    }
  } catch {
    vaultKey = null;
    return false;
  }

  await rekeyVaultFromLegacy(legacyKey, pin);
  return true;
}

/**
 * Re-encrypt every vault entry from the legacy static-salt key to a new
 * random-salt Argon2id key. Atomic-ish: writes new ciphertext, then swaps
 * the check token last so a crash mid-way still leaves the legacy vault
 * recoverable on the next unlock.
 */
async function rekeyVaultFromLegacy(legacyKey: CryptoKey, pin: string): Promise<void> {
  // Generate the new salt + key.
  localStorage.removeItem(VAULT_SALT_KEY);
  const newKey = await deriveVaultKey(pin);

  const vaultedKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(VAULT_PREFIX) && key !== VAULT_KEY_CHECK) {
      vaultedKeys.push(key);
    }
  }

  for (const k of vaultedKeys) {
    const enc = localStorage.getItem(k);
    if (!enc) continue;
    try {
      const pt = await decryptVaultData(legacyKey, enc);
      const reEnc = await encryptVaultData(newKey, pt);
      localStorage.setItem(k, reEnc);
    } catch {
      // skip corrupted entries
    }
  }

  // Finally rewrite the check token under the new key.
  const newCheck = await encryptVaultData(newKey, "phantom_vault_ok");
  localStorage.setItem(VAULT_KEY_CHECK, newCheck);
}

/**
 * Decrypt the current vault contents back into runtime localStorage so the rest
 * of the app can resume the same account after the lock screen is unlocked.
 */
export async function hydrateVaultToLocalStorage(): Promise<void> {
  if (!vaultKey) return;

  const vaultedKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(VAULT_PREFIX)) vaultedKeys.push(key);
  }

  for (const vaultedKey of vaultedKeys) {
    const encrypted = localStorage.getItem(vaultedKey);
    if (!encrypted) continue;
    try {
      const plaintext = await decryptVaultData(vaultKey, encrypted);
      const originalKey = vaultedKey.slice(VAULT_PREFIX.length);
      localStorage.setItem(originalKey, plaintext);
    } catch {
      // Ignore individual corrupted entries so the rest of the vault can still load.
    }
  }
}

function getSyncCandidateKeys(): string[] {
  const keys = new Set<string>(SENSITIVE_KEYS);

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (!key.startsWith(VAULT_PREFIX) && (
      key.startsWith("phantom_messages_") ||
      key.startsWith("phantom_ratchet_") ||
      key.startsWith("phantom_group_messages_")
    )) {
      keys.add(key);
    }

    if (key.startsWith(VAULT_PREFIX)) {
      const originalKey = key.slice(VAULT_PREFIX.length);
      if (
        originalKey.startsWith("phantom_messages_") ||
        originalKey.startsWith("phantom_ratchet_") ||
        originalKey.startsWith("phantom_group_messages_") ||
        SENSITIVE_KEYS.includes(originalKey)
      ) {
        keys.add(originalKey);
      }
    }
  }

  return Array.from(keys);
}

export async function syncVaultFromLocalStorage(keys?: string[], removePlaintext = false): Promise<void> {
  if (!vaultKey || isWiping()) return;

  for (const key of keys ?? getSyncCandidateKeys()) {
    const value = localStorage.getItem(key);
    if (value === null) {
      // Absence of the plaintext key usually means it is already safely stored
      // as `phantom_vault_${key}`. Do NOT remove the encrypted copy here — that
      // was wiping identity/contacts on the next background sync after unlock.
      continue;
    }

    const encrypted = await encryptVaultData(vaultKey, value);
    if (isWiping()) return; // a wipe started while encrypting: don't write anything back
    localStorage.setItem(VAULT_PREFIX + key, encrypted);
    if (removePlaintext) localStorage.removeItem(key);
  }
}

/**
 * Check if vault is currently unlocked.
 */
export function isVaultUnlocked(): boolean {
  return vaultKey !== null;
}

/**
 * Lock the vault (clear the in-memory key).
 */
export function lockVault(): void {
  vaultKey = null;
}

/**
 * Encrypt data for vault storage.
 */
async function encryptVaultData(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  let binary = "";
  combined.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/**
 * Decrypt data from vault storage.
 */
async function decryptVaultData(key: CryptoKey, encoded: string): Promise<string> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Store an item in the encrypted vault.
 */
export async function vaultSet(key: string, value: string): Promise<void> {
  if (!vaultKey) {
    localStorage.setItem(key, value);
    return;
  }
  const encrypted = await encryptVaultData(vaultKey, value);
  localStorage.setItem(VAULT_PREFIX + key, encrypted);
  // Remove any plaintext version
  if (localStorage.getItem(key)) localStorage.removeItem(key);
}

/**
 * Delete a sensitive item intentionally. Sync must not delete encrypted vault
 * entries just because the plaintext runtime copy is absent.
 */
export function vaultDelete(key: string): void {
  vaultRemove(key);
}

/**
 * Retrieve an item from the encrypted vault.
 */
export async function vaultGet(key: string): Promise<string | null> {
  if (!vaultKey) {
    return localStorage.getItem(key);
  }
  const encrypted = localStorage.getItem(VAULT_PREFIX + key);
  if (!encrypted) {
    // Check unencrypted fallback (pre-migration data)
    return localStorage.getItem(key);
  }
  try {
    return await decryptVaultData(vaultKey, encrypted);
  } catch {
    return localStorage.getItem(key);
  }
}

/**
 * Remove an item from the vault.
 */
export function vaultRemove(key: string): void {
  localStorage.removeItem(VAULT_PREFIX + key);
  localStorage.removeItem(key);
}

/**
 * Check if a vault has been set up.
 */
export function hasVault(): boolean {
  return !!localStorage.getItem(VAULT_KEY_CHECK);
}

/**
 * Securely overwrite a localStorage key before removal.
 */
function secureEraseKey(key: string): void {
  const current = localStorage.getItem(key);
  if (current !== null) {
    const overwrite = Array.from(
      crypto.getRandomValues(new Uint8Array(Math.max(current.length, 64)))
    ).map(b => String.fromCharCode(b % 94 + 33)).join("");
    localStorage.setItem(key, overwrite);
    localStorage.setItem(key, "\0".repeat(overwrite.length));
    localStorage.removeItem(key);
  }
}

/**
 * Clear all vault data with secure overwrite.
 */
export function clearVault(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(VAULT_PREFIX)) keysToRemove.push(key);
  }
  keysToRemove.forEach(secureEraseKey);
  secureEraseKey(VAULT_KEY_CHECK);
  localStorage.removeItem(VAULT_MIGRATED);
  vaultKey = null;
}
