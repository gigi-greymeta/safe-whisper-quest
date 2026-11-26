// The one full local erase, used by the Reset Wizard, Delete Account, the panic PIN and
// the Emergency Panic Wipe button, so they can't drift apart again.
//
// Order matters: `burnAllData` first stops realtime and clears the in-memory identity and
// contact caches, so nothing running in the background can write them back; then every
// storage area is cleared, including the separate IndexedDB mirrors of the identity and
// contacts (the cause of "Reset didn't reset": those mirrors survived and were restored
// on the next launch).

import { clearVault } from "@/store/vault";
import { disableLock, secureEraseAll } from "@/store/lock";
import { clearPinnedKeys } from "@/store/keyPinning";
import { clearPhantomStorageFromIDB } from "@/store/appPersist";
import { clearIdentityFromIDB } from "@/store/identityPersist";
import { clearContactsFromIDB } from "@/store/contactsPersist";
import { clearOutbox } from "@/store/outboxPersist";
import { clearSessionUnlock } from "@/store/sessionLock";
import { wipeDeviceCaches } from "@/lib/deviceWipe";
import { beginWipe } from "@/store/wipeGuard";

const quietly = async (step: () => unknown) => {
  try {
    await step();
  } catch {
    // Best effort: one failed step mustn't stop the rest of the wipe.
  }
};

export async function eraseAllLocalData(burnAllData?: () => void): Promise<void> {
  // From here on nothing may save to the vault or the IndexedDB mirrors.
  beginWipe();
  clearSessionUnlock();
  if (burnAllData) await quietly(burnAllData);
  await quietly(secureEraseAll);
  await quietly(clearVault);
  await quietly(clearPinnedKeys);
  await quietly(disableLock);
  await quietly(clearPhantomStorageFromIDB);
  await quietly(clearIdentityFromIDB);
  await quietly(clearContactsFromIDB);
  await quietly(clearOutbox);
  await quietly(() => localStorage.clear());
  await quietly(() => sessionStorage.clear());
  // Every remaining database, the web cache, cookies and the native WebView caches.
  await quietly(wipeDeviceCaches);
}

/** Reload to a fresh start (or the disguise's decoy screen). */
export function restartFresh(): void {
  window.location.replace(window.location.origin + "/");
}
