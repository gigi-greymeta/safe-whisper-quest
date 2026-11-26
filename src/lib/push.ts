// Push notifications, phase 1 (see docs/push-notifications-plan.md).
//
// Pushes carry no content: the server only learns "an envelope arrived in an inbox this phone
// owns" and sends a generic "New message". The phone registers its push token against the
// relay inboxes it owns (proving each with its read token), and re-registers when its inboxes,
// disguise or settings change. Every wipe unregisters it first.

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import { getDisguise } from "@/lib/disguise";
import { listMyInboxes } from "@/services/relayV2";
import type { InboxSecrets } from "@/crypto/relayV2";

const PREFS_KEY = "phantom_push_prefs";
const DEVICE_KEY = "phantom_push_device";

export interface PushPrefs {
  enabled: boolean;
  /** What to show while the app is disguised. Android and iOS still name the real app in the header. */
  whileDisguised: "off" | "disguise";
}

const DEFAULT_PREFS: PushPrefs = { enabled: false, whileDisguised: "off" };

export const pushSupported = () => Capacitor.isNativePlatform();

export function getPushPrefs(): PushPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePushPrefs(prefs: PushPrefs): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

/** Random per-install secret; its hash identifies this phone to the server. */
function deviceSecret(): string {
  let s = localStorage.getItem(DEVICE_KEY);
  if (!s) {
    s = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_KEY, s);
  }
  return s;
}

/** Which alert this phone should get right now, or null for none. */
export function alertStyleFor(prefs: PushPrefs, disguise: string): string | null {
  if (!prefs.enabled) return null;
  if (disguise === "default") return "generic";
  return prefs.whileDisguised === "disguise" ? disguise : null;
}

let token: string | null = null;
let tokenWaiters: ((t: string | null) => void)[] = [];
let listening = false;

async function listen() {
  if (listening) return;
  listening = true;
  await PushNotifications.addListener("registration", (t) => {
    token = t.value;
    tokenWaiters.forEach((w) => w(token));
    tokenWaiters = [];
  });
  await PushNotifications.addListener("registrationError", () => {
    tokenWaiters.forEach((w) => w(null));
    tokenWaiters = [];
  });
  // Private on the lock screen; no message text is ever in a push anyway.
  if (Capacitor.getPlatform() === "android") {
    await PushNotifications.createChannel({ id: "messages", name: "Messages", importance: 4, visibility: 0 }).catch(() => {});
  }
}

async function getToken(): Promise<string | null> {
  await listen();
  if (token) return token;
  const wait = new Promise<string | null>((resolve) => {
    tokenWaiters.push(resolve);
    setTimeout(() => resolve(null), 15_000);
  });
  await PushNotifications.register();
  return wait;
}

/** Ask for permission (only when the person turns notifications on). */
export async function requestPushPermission(): Promise<boolean> {
  if (!pushSupported()) return false;
  const status = await PushNotifications.checkPermissions();
  if (status.receive === "granted") return true;
  return (await PushNotifications.requestPermissions()).receive === "granted";
}

async function callPush(body: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.functions.invoke("push", { body });
  if (error) throw new Error("Couldn't reach the notification service.");
}

/**
 * Bring the server in line with this phone's settings: register (with every inbox it owns,
 * plus any `extraInboxes` such as the request inbox) or unregister.
 */
export async function syncPush(extraInboxes: { queueId: string; secrets: InboxSecrets }[] = []): Promise<void> {
  if (!pushSupported()) return;
  const style = alertStyleFor(getPushPrefs(), await getDisguise());
  if (!style) {
    await unregisterPush();
    return;
  }
  if ((await PushNotifications.checkPermissions()).receive !== "granted") return;
  const t = await getToken();
  if (!t) return;
  const inboxes = [...listMyInboxes(), ...extraInboxes].map((i) => ({ queueId: i.queueId, readToken: i.secrets.token }));
  await callPush({ action: "register", deviceSecret: deviceSecret(), platform: Capacitor.getPlatform(), token: t, alertStyle: style, inboxes });
}

/** Remove this phone's registration (settings off, disguise with alerts off, and every wipe). */
export async function unregisterPush(): Promise<void> {
  if (!pushSupported()) return;
  const secret = localStorage.getItem(DEVICE_KEY);
  if (secret) await callPush({ action: "unregister", deviceSecret: secret }).catch(() => {});
}
