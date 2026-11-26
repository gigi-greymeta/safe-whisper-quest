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

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "chime", label: "Chime" },
  { id: "pulse", label: "Pulse" },
  { id: "pop", label: "Pop" },
  { id: "blip", label: "Blip" },
  { id: "none", label: "Silent" },
];