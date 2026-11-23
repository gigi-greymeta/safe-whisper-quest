import { describe, it, expect, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }));

import { wipeDeviceCaches } from "@/lib/deviceWipe";

describe("wipeDeviceCaches", () => {
  it("clears session storage and page cookies, and finishes even when APIs are missing", async () => {
    sessionStorage.setItem("x", "1");
    document.cookie = "sidebar_state=true; path=/";
    await wipeDeviceCaches();
    expect(sessionStorage.length).toBe(0);
    expect(document.cookie).not.toContain("sidebar_state=true");
  });
});
