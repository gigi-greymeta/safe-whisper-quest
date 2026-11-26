import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@capgo/capacitor-native-biometric", () => ({ NativeBiometric: {} }));
vi.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));
vi.mock("@/lib/calls/voice-filter.worklet.js?url", () => ({ default: "" }));

import { block, getBlocked, isBlocked, unblock } from "@/store/blocked";
import { readableForReport } from "@/lib/reportText";
import { wrapScrambled } from "@/lib/scramble";
import { wrapPinDrop } from "@/lib/location";
import { wrapVoiceMessage } from "@/lib/voiceMessage";

describe("blocking", () => {
  beforeEach(() => localStorage.clear());
  it("blocks once and unblocks", () => {
    block("fp1", "Sam");
    block("fp1", "Sam");
    expect(getBlocked()).toHaveLength(1);
    expect(isBlocked("fp1")).toBe(true);
    unblock("fp1");
    expect(isBlocked("fp1")).toBe(false);
  });
});

describe("report text", () => {
  it("turns message envelopes into readable text", () => {
    expect(readableForReport("hello")).toBe("hello");
    expect(readableForReport(wrapScrambled("hidden"))).toBe("hidden");
    expect(readableForReport(wrapPinDrop({ lat: -33.85, lng: 151.2, label: "Here" }))).toBe('[Pin drop: -33.85000, 151.20000 "Here"]');
    expect(readableForReport(wrapVoiceMessage({ mime: "audio/webm", data: "AA", durationMs: 1 }))).toBe("[Voice message]");
    expect(readableForReport(JSON.stringify({ __type: "file_attachment", name: "a.jpg" }))).toBe("[Attachment: a.jpg]");
  });
});
