const KEY = "phantom_debug_console";
let loading: Promise<void> | null = null;

/**
 * Eruda is a heavy third-party debug console. Loading it from an external CDN
 * in production would defeat our strict CSP and give a third-party script full
 * access to vault ciphertext, identity keys, and decrypted messages. We
 * therefore hard-gate the entire feature to development builds. In production
 * every export is a no-op, regardless of any leftover localStorage flag.
 */
const DEV_ONLY = import.meta.env.DEV;

function loadEruda(): Promise<void> {
  if (!DEV_ONLY) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    if ((window as any).eruda) {
      (window as any).eruda.init();
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/eruda@3.4.1/eruda.min.js";
    s.onload = () => {
      try {
        (window as any).eruda?.init();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("Failed to load debug console"));
    document.head.appendChild(s);
  });
  return loading;
}

export function isDebugConsoleEnabled(): boolean {
  if (!DEV_ONLY) return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export async function enableDebugConsole(): Promise<void> {
  if (!DEV_ONLY) return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  await loadEruda();
}

export function disableDebugConsole(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  try {
    (window as any).eruda?.destroy();
  } catch {}
  loading = null;
}

export function initDebugConsoleIfEnabled(): void {
  if (!DEV_ONLY) return;
  if (isDebugConsoleEnabled()) {
    void loadEruda().catch((e) => console.warn("[debugConsole]", e));
  }
}