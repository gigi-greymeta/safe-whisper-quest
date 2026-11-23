// App disguise (Premium): swap the home-screen icon (and, on Android, the name)
// for a harmless-looking app. Native code in AppDisguisePlugin (Android: launcher
// activity-aliases; iOS: alternate app icons). The current disguise is read back
// from the OS, not localStorage, so it survives a panic wipe: the wiped app still
// opens looking like the disguise.

import { Capacitor, registerPlugin } from "@capacitor/core";

export type DisguiseId = "default" | "calculator" | "notes" | "weather";

export const DISGUISES: { id: DisguiseId; name: string }[] = [
  { id: "default", name: "Phantom" },
  { id: "calculator", name: "Calculator" },
  { id: "notes", name: "Notes" },
  { id: "weather", name: "Weather" },
];

interface AppDisguisePlugin {
  getCurrent(): Promise<{ id: DisguiseId }>;
  set(options: { id: DisguiseId }): Promise<void>;
}

const AppDisguise = registerPlugin<AppDisguisePlugin>("AppDisguise");

export const disguiseSupported = (): boolean => Capacitor.isNativePlatform();

export async function getDisguise(): Promise<DisguiseId> {
  if (!disguiseSupported()) return "default";
  try {
    return (await AppDisguise.getCurrent()).id;
  } catch {
    return "default";
  }
}

export async function setDisguise(id: DisguiseId): Promise<void> {
  await AppDisguise.set({ id });
}
