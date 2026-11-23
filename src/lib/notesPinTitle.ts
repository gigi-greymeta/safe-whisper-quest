// The decoy notepad's hidden way in: a new note whose title is the PIN.

import { hasNotepadPin, hasPanicPin, isLockedOut, matchesPinQuietly, verifyNotepadPin, verifyPanicPin, verifyPin } from "@/store/lock";
import { biometricsAvailable, verifyWithBiometrics } from "@/lib/scramble";
import type { NotepadSettings } from "@/store/notes";

export type TitleCheck = "unlock" | "panic" | "none";

/**
 * Check a title against the app PIN. Titles that look like a PIN (all digits) count
 * toward the normal lockout, so the decoy can't be used to guess PINs forever; any
 * other title (ordinary notes, or a passphrase) is checked without counting.
 */
export async function titleMatchesAppPin(title: string): Promise<boolean> {
  if (isLockedOut().locked) return false;
  return /^\d{4,12}$/.test(title) ? verifyPin(title) : matchesPinQuietly(title);
}

/**
 * What a new note's title means. Ordinary titles are "none" and the note is kept as
 * a normal decoy note; nothing on screen hints that anything was checked.
 */
export async function checkNoteTitle(title: string, settings: NotepadSettings): Promise<TitleCheck> {
  if (title.length < 4 || title.length > 64) return "none";
  if (hasPanicPin() && (await verifyPanicPin(title))) return "panic";
  const usesNotepadPin = settings.pinSource === "notepad" && hasNotepadPin();
  const matches = usesNotepadPin ? await verifyNotepadPin(title) : await titleMatchesAppPin(title);
  if (!matches) return "none";
  // "Fingerprint or face only": the PIN note opens the prompt, the biometric unlocks.
  if (settings.unlock === "biometrics" && (await biometricsAvailable())) {
    return (await verifyWithBiometrics("Open notes")) === "ok" ? "unlock" : "none";
  }
  return "unlock";
}
