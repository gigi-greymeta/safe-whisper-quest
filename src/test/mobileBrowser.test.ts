import { describe, it, expect } from "vitest";
import { detectMobileBrowser } from "@/lib/mobileBrowser";

describe("detectMobileBrowser", () => {
  it("spots phones", () => {
    expect(detectMobileBrowser("Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile")).toBe("android");
    expect(detectMobileBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari")).toBe("ios");
  });
  it("spots iPads posing as desktop Safari", () => {
    expect(detectMobileBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 5)).toBe("ios");
  });
  it("leaves desktop browsers alone", () => {
    expect(detectMobileBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari", 0)).toBeNull();
    expect(detectMobileBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBeNull();
  });
});
