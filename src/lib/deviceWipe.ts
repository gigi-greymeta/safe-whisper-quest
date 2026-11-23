// Clears every cache and storage area the app can reach, beyond localStorage.
// Used by the panic wipe (and the Emergency Panic Wipe button) after the app's own
// data has been erased, so nothing is left in browser databases, the web cache,
// cookies, or the native WebView / app cache folders.

import { Capacitor, registerPlugin } from "@capacitor/core";

interface DeviceWipePlugin {
  /** Android: WebView cache, web storage, cookies, cache dirs. iOS: all WebKit data, URL cache, Caches and tmp dirs. */
  wipeCaches(): Promise<void>;
}

const DeviceWipe = registerPlugin<DeviceWipePlugin>("DeviceWipe");

/** Never let a slow step hold up the reload; anything unfinished is best effort. */
const withTimeout = (p: Promise<unknown>, ms: number) => Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, ms))]);

async function wipeWebStorage(): Promise<void> {
  try {
    sessionStorage.clear();
  } catch {
    // Blocked storage: nothing to clear.
  }

  // Every IndexedDB database, not only the app's own mirror.
  try {
    const dbs = (await indexedDB.databases?.()) ?? [{ name: "phantom_app_state_db" }];
    await Promise.all(
      dbs
        .filter((db) => db.name)
        .map(
          (db) =>
            new Promise<void>((resolve) => {
              const req = indexedDB.deleteDatabase(db.name!);
              req.onsuccess = req.onerror = req.onblocked = () => resolve();
            })
        )
    );
  } catch {
    // IndexedDB unavailable.
  }

  // Cache Storage and any service workers.
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    // Cache API unavailable.
  }
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
  } catch {
    // No service worker support.
  }

  // Cookies visible to the page.
  try {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  } catch {
    // Cookies blocked.
  }
}

export async function wipeDeviceCaches(): Promise<void> {
  await withTimeout(wipeWebStorage(), 2000);
  if (Capacitor.isNativePlatform()) await withTimeout(DeviceWipe.wipeCaches(), 2000);
}
