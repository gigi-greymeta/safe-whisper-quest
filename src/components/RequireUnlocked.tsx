import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { hasVault, isVaultUnlocked } from "@/store/vault";
import { isLockEnabled } from "@/store/lock";
import { hasActiveUnlockSession } from "@/store/sessionLock";

/**
 * Route guard: blocks rendering of protected pages (Chat, GroupChat, etc.)
 * unless the encrypted vault is currently unlocked.
 *
 * If a user manually navigates to a deep link like /chat/:contactId in a
 * fresh browser tab, this prevents the page from mounting and dispatches
 * the global `phantom:lock` event so the App-level LockScreen takes over.
 */
export default function RequireUnlocked({ children }: { children: ReactNode }) {
  const vaultPresent = hasVault();
  const lockOn = isLockEnabled();
  const unlocked = isVaultUnlocked();
  const sessionUnlocked = hasActiveUnlockSession();
  const blocked = vaultPresent ? !unlocked : lockOn && !sessionUnlocked;

  useEffect(() => {
    if (blocked) {
      // Ask the App shell to show the LockScreen.
      window.dispatchEvent(new Event("phantom:lock"));
    }
  }, [blocked]);

  if (blocked) {
    // Render nothing while the lock screen is being raised.
    // Fallback redirect to "/" in case the lock event listener is missing.
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
