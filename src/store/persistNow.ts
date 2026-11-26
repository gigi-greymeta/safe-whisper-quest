// Save a deletion everywhere at once: the encrypted vault and the IndexedDB snapshot.
// Without this, a deleted setting (panic PIN, screen lock, notes PIN) or message could
// come back if the app closed before the next routine save, because the snapshot is
// restored on launch. Imported lazily to avoid circular imports with the stores.

export function persistNow(): void {
  void import("@/store/vault").then((m) => m.syncVaultFromLocalStorage()).catch(() => {});
  void import("@/store/appPersist").then((m) => m.mirrorPhantomStorageToIDB()).catch(() => {});
}
