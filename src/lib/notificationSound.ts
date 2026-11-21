import { getNotificationPrefs, type SoundId } from "@/store/notificationPrefs";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
          .AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function beep(
  ac: AudioContext,
  freq: number,
  start: number,
  duration: number,
  vol: number,
  type: OscillatorType = "sine",
) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(vol, ac.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

export function playSound(id: SoundId, volume = 0.5): void {
  if (id === "none") return;
  const ac = getCtx();
  if (!ac) return;
  const v = Math.max(0, Math.min(1, volume));
  switch (id) {
    case "chime":
      beep(ac, 880, 0, 0.18, v, "sine");
      beep(ac, 1320, 0.12, 0.22, v * 0.9, "sine");
      break;
    case "pulse":
      beep(ac, 220, 0, 0.12, v, "triangle");
      beep(ac, 220, 0.16, 0.12, v, "triangle");
      break;
    case "pop":
      beep(ac, 660, 0, 0.08, v, "square");
      break;
    case "blip":
      beep(ac, 1760, 0, 0.06, v * 0.8, "sine");
      beep(ac, 2400, 0.05, 0.06, v * 0.6, "sine");
      break;
  }
}

/** Called on incoming decrypted message. Respects user prefs. */
export function playIncomingMessageSound(): void {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled) return;
  if (prefs.onlyWhenHidden && typeof document !== "undefined" && document.visibilityState === "visible") {
    return;
  }
  playSound(prefs.sound, prefs.volume);
}