const SESSION_UNLOCKED_KEY = "phantom_session_unlocked";

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markSessionUnlocked(): void {
  getSessionStorage()?.setItem(SESSION_UNLOCKED_KEY, "true");
}

export function clearSessionUnlock(): void {
  getSessionStorage()?.removeItem(SESSION_UNLOCKED_KEY);
}

export function hasActiveUnlockSession(): boolean {
  return getSessionStorage()?.getItem(SESSION_UNLOCKED_KEY) === "true";
}