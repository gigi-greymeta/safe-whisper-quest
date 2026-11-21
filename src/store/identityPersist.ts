// Mirrors the identity to IndexedDB so it survives browsers/contexts that
// aggressively clear localStorage (DuckDuckGo, Safari Private, Brave Strict).
// On startup we read from BOTH stores and reconcile, so the user never sees
// the "Create Identity" screen unless storage is truly empty everywhere.

import type { Identity } from "@/store/identity";

const DB_NAME = "phantom_identity_db";
const STORE = "identity";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function mirrorIdentityToIDB(identity: Identity): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(identity, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[identityPersist] IDB mirror failed:", e);
  }
}

export async function readIdentityFromIDB(): Promise<Identity | null> {
  try {
    const db = await openDb();
    const result = await new Promise<Identity | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Identity) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn("[identityPersist] IDB read failed:", e);
    return null;
  }
}

export async function clearIdentityFromIDB(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}
