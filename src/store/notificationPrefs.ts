const KEY = "phantom_notification_prefs_v1";

export type SoundId = "chime" | "pulse" | "pop" | "blip" | "none";

export interface NotificationPrefs {
  enabled: boolean;
  sound: SoundId;
  volume: number; // 0..1
  onlyWhenHidden: boolean; // only beep when tab not focused
}

const DEFAULTS: NotificationPrefs = {
  enabled: true,
  sound: "chime",
  volume: 0.5,
  onlyWhenHidden: false,
};

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setNotificationPrefs(prefs: NotificationPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export const SOUND_OPTIONS: { id: SoundId; label: string; description: string }[] = [
  { id: "chime", label: "Chime", description: "Soft two-note bell" },
  { id: "pulse", label: "Pulse", description: "Short low pulse" },
  { id: "pop", label: "Pop", description: "Single quick pop" },
  { id: "blip", label: "Blip", description: "High digital blip" },
  { id: "none", label: "Silent", description: "No sound" },
];