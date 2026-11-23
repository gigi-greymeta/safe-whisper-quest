import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/calls/voice-filter.worklet.js?url", () => ({ default: "" }));

import { formatDuration, MAX_CHAT_VOICE_BYTES, parseVoiceMessage, wrapVoiceMessage } from "@/lib/voiceMessage";

describe("voice messages", () => {
  it("round-trip through the message envelope", () => {
    const v = { mime: "audio/webm;codecs=opus", data: "AAEC", durationMs: 4200 };
    expect(parseVoiceMessage(wrapVoiceMessage(v))).toEqual(v);
  });
  it("reject non-audio and ordinary text", () => {
    expect(parseVoiceMessage("hello")).toBeNull();
    expect(parseVoiceMessage(JSON.stringify({ __type: "voice_message", mime: "text/html", data: "x" }))).toBeNull();
  });
  it("fit a maximum-size recording under the relay's 512 KB cap", () => {
    // base64 in the envelope, then encrypted and base64'd again by the transport.
    const envelope = Math.ceil(MAX_CHAT_VOICE_BYTES / 3) * 4 + 200;
    const onWire = Math.ceil((envelope + 64) / 3) * 4 + 1024;
    expect(onWire).toBeLessThan(524288);
  });
  it("formats durations", () => {
    expect(formatDuration(125_000)).toBe("2:05");
  });
});
