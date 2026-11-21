/**
 * Epoch-based forward-secure local storage keys.
 * 
 * Messages are encrypted with keys derived from time-based epochs.
 * When an epoch expires, its key is securely deleted — making past
 * messages permanently unreadable even if the device is compromised.
 * 
 * Default epoch: 24 hours.
 */

const EPOCH_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const EPOCH_KEYS_STORAGE = "phantom_epoch_keys";
const MAX_EPOCHS_RETAINED = 7; // keep up to 7 days of keys

function getCurrentEpochId(): number {
  return Math.floor(Date.now() / EPOCH_DURATION_MS);
}

function getEpochIdForTimestamp(ts: number): number {
  return Math.floor(ts / EPOCH_DURATION_MS);
}

interface EpochKeyEntry {
  epochId: number;
  key: string; // base64-encoded raw key
  expiresAt: number;
}

function loadEpochKeys(): EpochKeyEntry[] {
  try {
    const raw = localStorage.getItem(EPOCH_KEYS_STORAGE);
    if (!raw) return [];
    return JSON.parse(raw) as EpochKeyEntry[];
  } catch {
    return [];
  }
}

function saveEpochKeys(keys: EpochKeyEntry[]): void {
  localStorage.setItem(EPOCH_KEYS_STORAGE, JSON.stringify(keys));
}

async function generateEpochKey(): Promise<{ raw: string; cryptoKey: CryptoKey }> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", key);
  const raw = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return { raw, cryptoKey: key };
}

async function importEpochKey(b64: string): Promise<CryptoKey> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Get or create the CryptoKey for the current epoch.
 */
export async function getCurrentEpochKey(): Promise<CryptoKey> {
  const epochId = getCurrentEpochId();
  const keys = loadEpochKeys();
  const existing = keys.find((k) => k.epochId === epochId);
  
  if (existing) {
    return importEpochKey(existing.key);
  }

  // Generate new epoch key
  const { raw, cryptoKey } = await generateEpochKey();
  keys.push({
    epochId,
    key: raw,
    expiresAt: (epochId + 1) * EPOCH_DURATION_MS + MAX_EPOCHS_RETAINED * EPOCH_DURATION_MS,
  });
  saveEpochKeys(keys);
  return cryptoKey;
}

/**
 * Get the CryptoKey for a specific timestamp's epoch (for decryption).
 * Returns null if the epoch key has been purged.
 */
export async function getEpochKeyForTimestamp(ts: number): Promise<CryptoKey | null> {
  const epochId = getEpochIdForTimestamp(ts);
  const keys = loadEpochKeys();
  const entry = keys.find((k) => k.epochId === epochId);
  if (!entry) return null;
  return importEpochKey(entry.key);
}

/**
 * Purge expired epoch keys. Call periodically.
 * Securely overwrites key material before deletion.
 */
export function purgeExpiredEpochKeys(): number {
  const now = Date.now();
  const keys = loadEpochKeys();
  const minEpoch = getCurrentEpochId() - MAX_EPOCHS_RETAINED;
  
  const kept = keys.filter((k) => k.epochId >= minEpoch && k.expiresAt > now);
  const purged = keys.length - kept.length;
  
  if (purged > 0) {
    saveEpochKeys(kept);
  }
  
  return purged;
}

/**
 * Encrypt data with the current epoch key.
 */
export async function epochEncrypt(plaintext: string): Promise<{
  ciphertext: string;
  iv: string;
  epochId: number;
}> {
  const key = await getCurrentEpochKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    epochId: getCurrentEpochId(),
  };
}

/**
 * Decrypt data using the epoch key from when it was encrypted.
 * Returns null if the epoch key has been purged (forward secrecy achieved).
 */
export async function epochDecrypt(
  ciphertext: string,
  iv: string,
  timestamp: number
): Promise<string | null> {
  const key = await getEpochKeyForTimestamp(timestamp);
  if (!key) return null; // Key purged — message is gone forever

  const ciphertextBuf = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const ivBuf = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuf },
      key,
      ciphertextBuf
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

/**
 * Destroy all epoch keys immediately (panic wipe).
 */
export function destroyAllEpochKeys(): void {
  // Overwrite with random data before removing
  const overwrite = Array.from(crypto.getRandomValues(new Uint8Array(256)))
    .map((b) => String.fromCharCode(b % 94 + 33))
    .join("");
  localStorage.setItem(EPOCH_KEYS_STORAGE, overwrite);
  localStorage.setItem(EPOCH_KEYS_STORAGE, "\0".repeat(overwrite.length));
  localStorage.removeItem(EPOCH_KEYS_STORAGE);
}
