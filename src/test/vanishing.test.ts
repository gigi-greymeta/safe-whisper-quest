import { describe, it, expect, vi } from "vitest";

const posted: { key_day: number; iv: string; payload: string }[] = [];
vi.mock("@/lib/vanishing/api", () => ({
  postMessage: async (_q: string, key_day: number, iv: string, payload: string) => {
    posted.push({ key_day, iv, payload });
    return "id";
  },
}));

import { advanceChain, currentDay, decryptChunk, encryptChunk, encryptPayload, messageKey, newChain, newMediaKey, newSigningKeys, pruneChain } from "@/lib/vanishing/crypto";
import { openMessage, postToGroup } from "@/lib/vanishing/messages";
import type { VanishingGroup } from "@/store/vanishingGroups";

async function makeGroup(): Promise<{ group: VanishingGroup; outsiderSign: Awaited<ReturnType<typeof newSigningKeys>> }> {
  const alice = await newSigningKeys();
  const bob = await newSigningKeys();
  const group: VanishingGroup = {
    id: "g1",
    name: "Test",
    adminFingerprint: "alice",
    admins: ["alice"],
    queueId: "a".repeat(64),
    chain: newChain(currentDay() - 1),
    version: 2,
    members: [
      { fingerprint: "alice", name: "Alice", signPub: alice.pub },
      { fingerprint: "bob", name: "Bob", signPub: bob.pub },
    ],
    mySign: alice,
    createdAt: 0,
  };
  return { group, outsiderSign: await newSigningKeys() };
}

const row = (p: { key_day: number; iv: string; payload: string }) => ({
  id: crypto.randomUUID(),
  ...p,
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 48 * 3600e3).toISOString(),
});

describe("vanishing group keys", () => {
  it("can't recover earlier days' keys after pruning (forward secrecy)", async () => {
    const today = currentDay();
    const old = newChain(today - 5);
    const pruned = await pruneChain(old, today);
    expect(pruned.day).toBe(today - 2);
    expect(await messageKey(pruned, today - 3)).toBeNull();
    expect(await messageKey(pruned, today)).not.toBeNull();
    // Same key for the same day whether derived from the old or pruned chain.
    const fromOld = await advanceChain(old, today);
    const fromPruned = await advanceChain(pruned, today);
    expect(fromPruned.key).toBe(fromOld.key);
  });
});

describe("vanishing group messages", () => {
  it("round-trip between members with a valid signature", async () => {
    const { group } = await makeGroup();
    await postToGroup(group, "alice", { kind: "text", text: "hello" });
    const opened = await openMessage(group, row(posted.at(-1)!));
    expect(opened?.body).toEqual({ kind: "text", text: "hello" });
    expect(opened?.fromName).toBe("Alice");
  });

  it("reject a message claiming to be from a member but signed by someone else", async () => {
    const { group, outsiderSign } = await makeGroup();
    // Outsider who knows the group key signs as "bob".
    await postToGroup({ ...group, mySign: outsiderSign }, "bob", { kind: "text", text: "forged" });
    expect(await openMessage(group, row(posted.at(-1)!))).toBeNull();
  });

  it("reject a removed member's messages and tampered ciphertext", async () => {
    const { group } = await makeGroup();
    await postToGroup(group, "alice", { kind: "text", text: "hi" });
    const r = row(posted.at(-1)!);
    expect(await openMessage({ ...group, members: group.members.filter((m) => m.fingerprint !== "alice") }, r)).toBeNull();
    const tampered = { ...r, payload: r.payload.slice(0, -4) + (r.payload.endsWith("AAAA") ? "BBBB" : "AAAA") };
    expect(await openMessage(group, tampered)).toBeNull();
  });

  it("pad short and slightly longer messages to the same size", async () => {
    const key = (await messageKey(newChain(), currentDay()))!;
    const a = await encryptPayload(key, "hi", "aad");
    const b = await encryptPayload(key, "hi there, see you at six", "aad");
    expect(a.payload.length).toBe(b.payload.length);
  });

  it("encrypt media chunks bound to their position", async () => {
    const { key } = await newMediaKey();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const c = await encryptChunk(key, bytes, "m:0");
    expect(await decryptChunk(key, c.iv, c.data, "m:0")).toEqual(bytes);
    await expect(decryptChunk(key, c.iv, c.data, "m:1")).rejects.toThrow();
  });
});
