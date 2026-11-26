import { useEffect, useRef } from "react";
import { useCrypto } from "@/hooks/useCrypto";
import { myRequestInbox } from "@/lib/requests";
import { pushSupported, syncPush } from "@/lib/push";

/**
 * Keeps this phone's push registration in step with its inboxes (contacts added or removed),
 * disguise and notification settings. Does nothing until notifications are turned on.
 */
const PushManager = () => {
  const { state } = useCrypto();
  const identity = state.identity;
  const inboxKey = state.contacts.map((c) => c.id).join(",");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!identity || !pushSupported()) return;
    const run = () => {
      if (timer.current) clearTimeout(timer.current);
      // Wait for inbox registration after a contact change to settle.
      timer.current = setTimeout(async () => {
        try {
          const request = await myRequestInbox(identity.publicKeyFingerprint, identity.keyPair.privateKey);
          await syncPush([{ queueId: request.id, secrets: request.secrets }]);
        } catch (e) {
          console.warn("[push] sync failed", e);
        }
      }, 3000);
    };
    run();
    window.addEventListener("phantom:disguise", run);
    window.addEventListener("phantom:push-prefs", run);
    return () => {
      window.removeEventListener("phantom:disguise", run);
      window.removeEventListener("phantom:push-prefs", run);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [identity, inboxKey]);

  return null;
};

export default PushManager;
