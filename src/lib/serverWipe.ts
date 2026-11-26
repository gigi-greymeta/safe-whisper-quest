// Server side of a wipe: the account (directory entry, inbox queues, waiting messages,
// via the delete-identity function) and the chat history of vanishing groups this device
// runs (the groups themselves stay active for their members). Must run
// before the local erase, while the keys that prove ownership still exist.

import { deleteIdentityFromServer } from "@/services/relay";
import { wipeAdministeredGroups } from "@/contexts/VanishingGroupsContext";
import { getIdentity } from "@/store/identity";
import type { PanicWipeIdentity } from "@/store/lock";

export const SERVER_WIPE_TIMEOUT_MS = 4000;

/** The open identity as a wipe owner, if the app is unlocked. */
export function currentOwner(): PanicWipeIdentity | null {
  const id = getIdentity();
  return id ? { fingerprint: id.publicKeyFingerprint, privateKey: id.keyPair.privateKey } : null;
}

/**
 * Best effort, capped at `timeoutMs` so a slow or missing connection never holds up
 * the local wipe. Resolves true only if the account was confirmed deleted.
 */
export async function wipeServerData(owner: PanicWipeIdentity | null, timeoutMs = SERVER_WIPE_TIMEOUT_MS): Promise<boolean> {
  let accountDeleted = false;
  const work = Promise.allSettled([
    owner
      ? deleteIdentityFromServer(owner.fingerprint, owner.privateKey).then(() => {
          accountDeleted = true;
        })
      : Promise.resolve(),
    wipeAdministeredGroups(),
  ]);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  return accountDeleted;
}
