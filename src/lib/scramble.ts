// Scrambled messages (Premium to send, anyone can receive).
//
// The sender wraps the text in a "scrambled" envelope. The receiver's app
// shows look-alike noise until they prove it's them with biometrics or their
// app PIN. Three failed attempts delete the message from that device.
// Scrambling is display-only: the message is end-to-end encrypted like any other.

import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

export const MAX_UNLOCK_FAILURES = 3;
const SEND_PREF_KEY = "phantom_scramble_send";

export function wrapScrambled(text: string): string {
  return JSON.stringify({ __type: "scrambled", text });
}

/** The real text if this is a scrambled envelope, otherwise null. */
export function parseScrambled(text: string): string | null {
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed?.__type === "scrambled" && typeof parsed.text === "string" ? parsed.text : null;
  } catch {
    return null;
  }
}

const GLYPHS = "▓▒░█▚▞▙▟▛▜◼◆◈⬢⬣";

/**
 * Noise of roughly the same shape as the message: spaces and line breaks are
 * kept, every other character becomes a glyph. Seeded by the message id so it
 * doesn't flicker between renders.
 */
export function scrambleDisplay(text: string, seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let out = "";
  for (const ch of text) {
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    out += GLYPHS[(h >>> 0) % GLYPHS.length];
  }
  return out;
}

export function getScrambleSendPref(): boolean {
  try {
    return localStorage.getItem(SEND_PREF_KEY) === "true";
  } catch {
    return false;
  }
}

export function setScrambleSendPref(on: boolean): void {
  try {
    if (on) localStorage.setItem(SEND_PREF_KEY, "true");
    else localStorage.removeItem(SEND_PREF_KEY);
  } catch {
    // Storage blocked: the toggle still applies until the chat closes.
  }
}

export async function biometricsAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { isAvailable } = await NativeBiometric.isAvailable({ useFallback: false });
    return isAvailable;
  } catch {
    return false;
  }
}

/** BiometricAuthError codes that mean the person chose not to try, not that they failed. */
const NOT_AN_ATTEMPT = new Set([11, 13, 15, 16, 17]); // app/system/user cancel, not interactive, fallback

export type BiometricResult = "ok" | "failed" | "cancelled";

export async function verifyWithBiometrics(purpose = "Unscramble message"): Promise<BiometricResult> {
  try {
    await NativeBiometric.verifyIdentity({
      reason: purpose,
      title: purpose,
      negativeButtonText: "Use PIN",
      useFallback: false,
      maxAttempts: 1,
    });
    return "ok";
  } catch (e) {
    const code = Number((e as { code?: string | number })?.code);
    return NOT_AN_ATTEMPT.has(code) ? "cancelled" : "failed";
  }
}
