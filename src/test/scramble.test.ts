import { describe, it, expect, vi } from "vitest";

vi.mock("@capgo/capacitor-native-biometric", () => ({ NativeBiometric: {} }));

import { parseScrambled, scrambleDisplay, wrapScrambled } from "@/lib/scramble";

describe("scrambled messages", () => {
  it("round-trips through the envelope", () => {
    expect(parseScrambled(wrapScrambled("meet at 6"))).toBe("meet at 6");
  });
  it("leaves ordinary messages and other envelopes alone", () => {
    expect(parseScrambled("hello")).toBeNull();
    expect(parseScrambled(JSON.stringify({ __type: "file_attachment", name: "a" }))).toBeNull();
  });
  it("hides every character but keeps spacing, and is stable per message", () => {
    const shown = scrambleDisplay("meet at 6", "id-1");
    expect(shown).not.toMatch(/[a-z0-9]/i);
    expect(shown.split(" ").map((w) => [...w].length)).toEqual([4, 2, 1]);
    expect(scrambleDisplay("meet at 6", "id-1")).toBe(shown);
  });
});
