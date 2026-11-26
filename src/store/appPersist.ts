import { isWiping } from "@/store/wipeGuard";
const DB_NAME = "phantom_app_state_db";
const STORE_NAME = "app_state";
const SNAPSHOT_KEY = "snapshot";
const PHANTOM_PREFIX = "phantom_";
const VAULT_PREFIX = "phantom_vault_";
const PROTECTED_KEYS = [
  "phantom_identity",
  "phantom_contacts",
  "phantom_groups",
  "phantom_pinned_keys",
];

type PhantomSnapshot = Record<string, string>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readLocalSnapshot(): PhantomSnapshot {
  const snapshot: PhantomSnapshot = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    const isVaultKey = key.startsWith(VAULT_PREFIX);
    const isPlainPhantomKey = key.startsWith(PHANTOM_PREFIX) && !isVaultKey;
    if (!isPlainPhantomKey && !isVaultKey) continue;

    // If the app is currently unlocked, plaintext runtime keys are the newest
    // copy. Do not skip them just because an older encrypted vault copy exists;
    // that made the IDB safety snapshot preserve stale contacts/identity after
    // a fast PWA close or refresh.
    if (isVaultKey) {
      const plainKey = key.slice(VAULT_PREFIX.length);
      if (localStorage.getItem(plainKey) !== null) continue;
    }
    const value = localStorage.getItem(key);
    if (value !== null) snapshot[key] = value;
  }

  return snapshot;
}

export async function mirrorPhantomStorageToIDB(): Promise<void> {
  try {
    const db = await openDb();
    const existing = await new Promise<PhantomSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve((req.result as PhantomSnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
    const snapshot = readLocalSnapshot();
    if (isWiping()) {
      db.close();
      return;
    }
    for (const key of PROTECTED_KEYS) {
      const vaultKey = `${VAULT_PREFIX}${key}`;
      if (snapshot[key] === undefined && snapshot[vaultKey] === undefined && existing?.[vaultKey] !== undefined) {
        snapshot[vaultKey] = existing[vaultKey];
      }
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (error) {
    console.warn("[appPersist] IDB mirror failed:", error);
  }
}

export async function restorePhantomStorageFromIDB(): Promise<void> {
  try {
    const db = await openDb();
    const snapshot = await new Promise<PhantomSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      req.onsuccess = () => resolve((req.result as PhantomSnapshot) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();

    if (!snapshot) return;

    for (const [key, value] of Object.entries(snapshot)) {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    }
  } catch (error) {
    console.warn("[appPersist] IDB restore failed:", error);
  }
}

export async function clearPhantomStorageFromIDB(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}