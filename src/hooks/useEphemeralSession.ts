import { useEffect, useState } from "react";

/**
 * Best-effort detection of an "ephemeral" browsing session — primarily
 * incognito / private windows where:
 *   - identity keys won't survive closing the tab
 *   - PWA install is typically blocked
 *
 * No single API tells us this (browsers hide it on purpose), so we combine
 * three signals:
 *   1. Storage quota — private modes get tiny caps (Chrome ~120MB,
 *      Firefox/Safari near-zero) vs. gigabytes in normal sessions.
 *   2. navigator.storage.persist() — refused or fails silently in private.
 *   3. Service worker availability — disabled / restricted in most private
 *      modes (also a direct signal that PWA install won't work).
 *
 * Returns null while probing, then a stable boolean.
 */
export function useEphemeralSession(): boolean | null {
  const [ephemeral, setEphemeral] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        let smallQuota = false;
        let persistDenied = false;
        let noServiceWorker = false;

        // 1. Quota probe — < 200MB is a near-certain private-mode signal.
        try {
          const est = await navigator.storage?.estimate?.();
          if (est && typeof est.quota === "number") {
            smallQuota = est.quota > 0 && est.quota < 200 * 1024 * 1024;
          }
        } catch {
          // ignore
        }

        // 2. Persistent storage refusal.
        try {
          if (navigator.storage?.persist) {
            const granted = await navigator.storage.persist();
            persistDenied = granted === false;
          }
        } catch {
          persistDenied = true;
        }

        // 3. Service worker support.
        noServiceWorker = !("serviceWorker" in navigator);

        // Decision: small quota alone is enough; otherwise require two
        // weaker signals to avoid false positives on locked-down browsers.
        const verdict =
          smallQuota ||
          (persistDenied && noServiceWorker);

        if (!cancelled) setEphemeral(verdict);
      } catch {
        if (!cancelled) setEphemeral(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return ephemeral;
}