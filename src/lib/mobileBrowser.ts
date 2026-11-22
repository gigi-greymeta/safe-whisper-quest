export type MobileOS = "ios" | "android";

/** Phone or tablet browser (not the native app). */
export function detectMobileBrowser(userAgent: string, maxTouchPoints = 0): MobileOS | null {
  if (/android/i.test(userAgent)) return "android";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "ios";
  // iPadOS reports itself as desktop Safari; touch support gives it away.
  if (/macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}
