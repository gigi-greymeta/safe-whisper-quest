// TOFU (Trust On First Use) key pinning
// Pins a contact's public key on first encounter.
// Warns if the key changes — possible MITM attack.

const PINNED_KEYS_STORAGE = "phantom_pinned_keys";

interface PinnedKey {
  /** Hash of the public key JWK for comparison */
  keyHash: string;
  pinnedAt: number;
  displayName: string;
}

function getPinnedKeys(): Record<string, PinnedKey> {
  const stored = localStorage.getItem(PINNED_KEYS_STORAGE);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function savePinnedKeys(keys: Record<string, PinnedKey>): void {
  localStorage.setItem(PINNED_KEYS_STORAGE, JSON.stringify(keys));
}

/** Compute a simple hash of a JWK for comparison */
function hashJwk(jwk: JsonWebKey): string {
  // Use the x,y coordinates (unique per key) as the hash basis
  return `${jwk.kty}:${jwk.crv}:${jwk.x}:${jwk.y}`;
}

function keyMatches(existingHash: string, contactFingerprint: string, publicKeyJwk?: JsonWebKey): boolean {
  const currentHash = publicKeyJwk ? hashJwk(publicKeyJwk) : contactFingerprint;
  // Legacy pins stored the public-key fingerprint directly. Current pins store
  // the JWK coordinate hash. Both identify the same long-term key, so treating
  // the legacy value as a mismatch causes a false red identity warning.
  return existingHash === currentHash || existingHash === contactFingerprint;
}

/**
 * Pin a key for a contact. Returns:
 * - "pinned" if this is a new pin
 * - "match" if the key matches the existing pin
 * - "mismatch" if the key differs from the pinned key (⚠️ MITM warning)
 */
export function pinKey(
  contactFingerprint: string,
  displayName: string,
  publicKeyJwk?: JsonWebKey
): "pinned" | "match" | "mismatch" {
  const keys = getPinnedKeys();
  const existing = keys[contactFingerprint];
  const currentHash = publicKeyJwk ? hashJwk(publicKeyJwk) : contactFingerprint;

  if (!existing) {
    keys[contactFingerprint] = {
      keyHash: currentHash,
      pinnedAt: Date.now(),
      displayName,
    };
    savePinnedKeys(keys);
    return "pinned";
  }

  if (keyMatches(existing.keyHash, contactFingerprint, publicKeyJwk)) {
    return "match";
  }

  return "mismatch";
}

/**
 * Check if a contact's key matches the pinned key.
 * Returns null if no pin exists.
 */
export function checkPinnedKey(contactFingerprint: string, publicKeyJwk?: JsonWebKey): "match" | "mismatch" | null {
  const keys = getPinnedKeys();
  const existing = keys[contactFingerprint];
  if (!existing) return null;
  return keyMatches(existing.keyHash, contactFingerprint, publicKeyJwk) ? "match" : "mismatch";
}

/**
 * Get pinned key info for a contact.
 */
export function getPinnedKey(contactFingerprint: string): PinnedKey | null {
  const keys = getPinnedKeys();
  return keys[contactFingerprint] || null;
}

/**
 * Remove a pinned key (e.g. after re-verification).
 */
export function unpinKey(contactFingerprint: string): void {
  const keys = getPinnedKeys();
  delete keys[contactFingerprint];
  savePinnedKeys(keys);
}

/**
 * Clear all pinned keys.
 */
export function clearPinnedKeys(): void {
  localStorage.removeItem(PINNED_KEYS_STORAGE);
}

/**
 * Accept a key change (re-pin with current key).
 */
export function acceptKeyChange(contactFingerprint: string, displayName: string, publicKeyJwk?: JsonWebKey): void {
  const keys = getPinnedKeys();
  const currentHash = publicKeyJwk ? hashJwk(publicKeyJwk) : contactFingerprint;
  keys[contactFingerprint] = {
    keyHash: currentHash,
    pinnedAt: Date.now(),
    displayName,
  };
  savePinnedKeys(keys);
}
