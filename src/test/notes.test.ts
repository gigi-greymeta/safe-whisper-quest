import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/store/identity", () => ({
  getIdentity: () => ({ keyPair: { privateKey: { d: "test-private-scalar" } } }),
}));

import { getNotepadSettings, loadDecoyNotes, loadSecureNotes, saveSecureNotes } from "@/store/notes";

describe("secure notes", () => {
  beforeEach(() => localStorage.clear());

  it("are encrypted at rest and decrypt back", async () => {
    const notes = [{ id: "1", title: "Bank", body: "safe deposit box 42", updatedAt: 1 }];
    await saveSecureNotes(notes);
    const stored = localStorage.getItem("phantom_secure_notes") ?? "";
    expect(stored).not.toContain("safe deposit");
    expect(await loadSecureNotes()).toEqual(notes);
  });

  it("start the decoy list with ordinary notes", () => {
    const decoys = loadDecoyNotes();
    expect(decoys.length).toBeGreaterThan(0);
    expect(loadDecoyNotes()).toEqual(decoys); // persisted, not regenerated
  });

  it("open to the decoy list by default", () => {
    expect(getNotepadSettings().decoy).toBe(true);
  });
});
