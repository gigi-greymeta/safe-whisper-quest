// Persistent outbox for unsent messages.
// When sendRelayMessage fails (offline, relay down, transient network),
// we enqueue the encrypted payload here so it survives reload/PWA restart.
// On relay reconnect we drain the queue. After MAX_ATTEMPTS the entry is
// marked "failed" so the UI surfaces it instead of retrying forever.

const DB_NAME = "phantom_outbox_db";
const STORE = "outbox";

export const MAX_ATTEMPTS = 10;

export interface OutboxEntry {
  id: string;                 // local message id (matches StoredMessage.id when applicable)
  contactId: string;
  queueId: string;            // outbox queue id at the moment of enqueue
  payload: string;            // already-encrypted ciphertext (ratchet or legacy)
  iv: string;
  hmac: string | null;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
  status: "pending" | "failed";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueOutbox(entry: OutboxEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[outbox] enqueue failed:", e);
  }
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  try {
    const db = await openDb();
    const result = await new Promise<OutboxEntry[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as OutboxEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn("[outbox] list failed:", e);
    return [];
  }
}

export async function removeOutbox(id: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[outbox] remove failed:", e);
  }
}

export async function updateOutbox(id: string, updates: Partial<OutboxEntry>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result as OutboxEntry | undefined;
        if (!existing) return resolve();
        store.put({ ...existing, ...updates });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[outbox] update failed:", e);
  }
}

export async function clearOutbox(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {}
}
