// QR decoding (camera frames) and the meaning of Phantom's two QR codes:
//   identity code  — the contact's public-key fingerprint (Settings > Identity)
//   safety code    — the 60-digit safety number of a conversation (Safety Number)
// Everything is decoded on the device; no frame or code leaves it.

import jsQR from "jsqr";
import { base64ToPublicKey, publicKeyToBase64, registryKeyMatchesFingerprint } from "@/crypto/keys";

type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

let detector: Detector | null | undefined;
function nativeDetector(): Detector | null {
  if (detector !== undefined) return detector;
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  try {
    detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
  } catch {
    detector = null;
  }
  return detector;
}

/** Decode a QR code from the current frame drawn on `canvas`, or null. */
export async function decodeQrFromCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  const native = nativeDetector();
  if (native) {
    try {
      const [found] = await native.detect(canvas);
      if (found?.rawValue) return found.rawValue;
    } catch {
      // Fall through to the JavaScript decoder.
    }
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return null;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

export type ScannedContact = { fingerprint: string; publicKey: JsonWebKey };

/** A scanned identity code as a contact key, or null if it isn't one. */
export function parseIdentityCode(text: string): ScannedContact | null {
  try {
    const cleaned = text.trim();
    const publicKey = base64ToPublicKey(cleaned);
    const fingerprint = publicKeyToBase64(publicKey);
    return registryKeyMatchesFingerprint(fingerprint, publicKey) ? { fingerprint, publicKey } : null;
  } catch {
    return null;
  }
}

/** Digits only, so "12345 67890 …" and "1234567890…" compare equal. */
export const safetyDigits = (value: string) => value.replace(/\D/g, "");
