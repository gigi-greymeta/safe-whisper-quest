import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/identity", () => ({ getIdentity: () => null }));
vi.mock("@/lib/scramble", () => ({ biometricsAvailable: async () => false, verifyWithBiometrics: async () => "ok" }));

const lock = vi.hoisted(() => ({
  pin: "4826",
  panic: "9999",
  verifyPin: vi.fn(async (p: string) => p === "4826"),
}));
vi.mock("@/store/lock", () => ({
  hasNotepadPin: () => false,
  hasPanicPin: () => true,
  isLockedOut: () => ({ locked: false, remainingMs: 0 }),
  matchesPinQuietly: async (p: string) => p === lock.pin,
  verifyNotepadPin: async () => false,
  verifyPanicPin: async (p: string) => p === lock.panic,
  verifyPin: lock.verifyPin,
}));

import { scrambleFrame } from "@/lib/scrambleText";
import { randomDecoyNotes, loadDecoyNotes } from "@/store/notes";
import { checkNoteTitle } from "@/lib/notesPinTitle";

const settings = { unlock: "any" as const, pinSource: "app" as const, decoy: true };

describe("scramble animation", () => {
  const seeds = [0.1, 0.5, 0.9];
  it("starts as the decoy text and ends as the real text", () => {
    expect(scrambleFrame("Groceries", "Bank details", 0, seeds)).toBe("Groceries");
    expect(scrambleFrame("Groceries", "Bank details", 1, seeds)).toBe("Bank details");
  });
  it("is scrambled part-way through", () => {
    const mid = scrambleFrame("Groceries list here", "Real private notes!", 0.55, seeds);
    expect(mid).not.toBe("Groceries list here");
    expect(mid).not.toBe("Real private notes!");
  });
});

describe("random decoy notes", () => {
  beforeEach(() => localStorage.clear());
  it("picks 4 to 7 everyday notes with past dates", () => {
    const notes = randomDecoyNotes();
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.length).toBeLessThanOrEqual(7);
    expect(notes.every((n) => n.updatedAt < Date.now() && n.title)).toBe(true);
  });
  it("stays the same each time Notes opens", () => {
    expect(loadDecoyNotes()).toEqual(loadDecoyNotes());
  });
});

describe("PIN as a note title", () => {
  beforeEach(() => lock.verifyPin.mockClear());
  it("unlocks with the PIN, wipes with the panic PIN, and ignores ordinary titles", async () => {
    expect(await checkNoteTitle("4826", settings)).toBe("unlock");
    expect(await checkNoteTitle("9999", settings)).toBe("panic");
    expect(await checkNoteTitle("Groceries", settings)).toBe("none");
    expect(await checkNoteTitle("Hi", settings)).toBe("none");
  });
  it("counts PIN-like guesses toward the lockout, but not ordinary titles", async () => {
    await checkNoteTitle("1234", settings);
    await checkNoteTitle("Shopping list", settings);
    expect(lock.verifyPin).toHaveBeenCalledTimes(1);
    expect(lock.verifyPin).toHaveBeenCalledWith("1234");
  });
});
