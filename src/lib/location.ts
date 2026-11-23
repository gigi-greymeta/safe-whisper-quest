// Pin drops (Premium to send, anyone can open): a location shared in a chat.
//
// The pin travels as an end-to-end encrypted message like any other. No map is
// drawn inside the app, because loading map tiles would tell a map provider where
// the pin is. "Open in Maps" hands the coordinates to the phone's maps app only
// when the person taps it.

import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface PinDrop {
  lat: number;
  lng: number;
  /** Accuracy radius in metres, when the pin came from GPS. */
  accuracy?: number;
  label?: string;
}

export function wrapPinDrop(pin: PinDrop): string {
  return JSON.stringify({ __type: "pin_drop", ...pin });
}

const validCoords = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** The pin if this message text is a pin drop, otherwise null. */
export function parsePinDrop(text: string): PinDrop | null {
  if (!text.startsWith("{")) return null;
  try {
    const p = JSON.parse(text);
    if (p?.__type !== "pin_drop" || !validCoords(p.lat, p.lng)) return null;
    return {
      lat: p.lat,
      lng: p.lng,
      accuracy: typeof p.accuracy === "number" ? p.accuracy : undefined,
      label: typeof p.label === "string" ? p.label.slice(0, 120) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Read coordinates typed or pasted by the user: "-33.86, 151.21", or a Google or
 * Apple Maps link containing them. Lets someone drop a pin at a meeting place
 * found in their maps app, not just where they're standing.
 */
export function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const text = decodeURIComponent(input.trim());
  const patterns = [
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // google.com/maps/@lat,lng,zoom
    /[?&](?:q|ll|query|sll|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?q=lat,lng
    /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/, // plain "lat, lng"
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (validCoords(lat, lng)) return { lat, lng };
    }
  }
  return null;
}

export async function getCurrentPin(): Promise<PinDrop> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const asked = await Geolocation.requestPermissions({ permissions: ["location"] });
      if (asked.location !== "granted") throw new Error("Location permission was not given.");
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
  }
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
      (err) => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  );
}

export const formatCoords = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Link that opens the pin in the phone's maps app (Apple Maps on iOS, Google Maps elsewhere). */
export function mapsUrl(p: PinDrop): string {
  const label = encodeURIComponent(p.label || "Pin");
  return Capacitor.getPlatform() === "ios"
    ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${label}`
    : `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
