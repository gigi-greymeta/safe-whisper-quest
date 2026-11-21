// Local identity management — stores keypair and display name in localStorage,
// AND mirrors to IndexedDB so the identity survives browsers that aggressively
// clear localStorage (DuckDuckGo, Safari Private mode, Brave Strict).

import { generateIdentityKeyPair, exportKeyPair, publicKeyToBase64 } from "@/crypto/keys";
import type { KeyPairData } from "@/crypto/keys";
import { mirrorIdentityToIDB, readIdentityFromIDB, clearIdentityFromIDB } from "@/store/identityPersist";
import { vaultGet } from "@/store/vault";

const IDENTITY_KEY = "phantom_identity";

export interface Identity {
  displayName: string;
  keyPair: KeyPairData;
  publicKeyFingerprint: string;
  createdAt: number;
}

/**
 * In-memory cache of the current identity. Privacy browsers (DuckDuckGo,
 * Safari Private, iOS PWA in some configurations) silently drop or refuse
 * localStorage writes — so even after restoreIdentityIfMissing() pulls the
 * identity back from IndexedDB, a subsequent localStorage.getItem() can
 * still return null. We mirror to memory so synchronous getIdentity()
 * callers always see the real identity.
 */
let identityMemCache: Identity | null = null;

export async function createIdentity(displayName: string): Promise<Identity> {
  const keyPair = await generateIdentityKeyPair();
  const exported = await exportKeyPair(keyPair);
  const fingerprint = publicKeyToBase64(exported.publicKey);

  const identity: Identity = {
    displayName,
    keyPair: exported,
    publicKeyFingerprint: fingerprint,
    createdAt: Date.now(),
  };

  identityMemCache = identity;
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // localStorage may be blocked (private mode quota) — IDB mirror + mem
    // cache below keep the app working anyway.
  }
  // Mirror before returning so a fast PWA close/reload cannot lose the
  // freshly-created identity before the background write completes.
  await mirrorIdentityToIDB(identity);
  return identity;
}

export function getIdentity(): Identity | null {
  if (identityMemCache) return identityMemCache;
  const stored = localStorage.getItem(IDENTITY_KEY);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Identity;
    identityMemCache = parsed;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Async restore: if localStorage has no identity but IndexedDB does
 * (e.g. user is in DuckDuckGo and localStorage was cleared), copy it back
 * into localStorage so the rest of the app — which is sync — keeps working.
 * Returns the resolved identity (or null if neither store has one).
 */
export async function restoreIdentityIfMissing(): Promise<Identity | null> {
  if (identityMemCache) {
    void mirrorIdentityToIDB(identityMemCache);
    return identityMemCache;
  }
  const local = getIdentity();
  if (local) {
    // Keep IDB mirror fresh
    void mirrorIdentityToIDB(local);
    return local;
  }
  const vaulted = await vaultGet(IDENTITY_KEY);
  if (vaulted) {
    try {
      const parsed = JSON.parse(vaulted) as Identity;
      identityMemCache = parsed;
      void mirrorIdentityToIDB(parsed);
      try {
        localStorage.setItem(IDENTITY_KEY, JSON.stringify(parsed));
      } catch {
        // localStorage unavailable — memory cache still keeps runtime working.
      }
      return parsed;
    } catch {
      // Corrupt vault entry — fall through to the IndexedDB mirror.
    }
  }
  const fromIdb = await readIdentityFromIDB();
  if (fromIdb) {
    identityMemCache = fromIdb;
    try {
      localStorage.setItem(IDENTITY_KEY, JSON.stringify(fromIdb));
    } catch {
      // localStorage genuinely unavailable — caller will still get the identity
    }
    return fromIdb;
  }
  return null;
}

export function clearIdentity(): void {
  identityMemCache = null;
  localStorage.removeItem(IDENTITY_KEY);
  void clearIdentityFromIDB();
}

export function hasIdentity(): boolean {
  return identityMemCache !== null || localStorage.getItem(IDENTITY_KEY) !== null;
}
