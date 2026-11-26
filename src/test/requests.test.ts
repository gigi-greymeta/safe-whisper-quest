import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/relayV2", () => ({ sendToInbox: vi.fn() }));

import { exportKeyPair, generateIdentityKeyPair, publicKeyToBase64 } from "@/crypto/keys";
import { openRequest, requestInboxId, sealRequest } from "@/lib/requests";
import { addRequest, getRequests } from "@/store/messageRequests";

async function person() {
  const id = await exportKeyPair(await generateIdentityKeyPair());
  return { fingerprint: publicKeyToBase64(id.publicKey), privateKey: id.privateKey };
}

describe("message requests", () => {
  it("reach the recipient with a verified sender and preview", async () => {
    const [alice, bob] = await Promise.all([person(), person()]);
    const sealed = await sealRequest(alice, bob.fingerprint, { t: "contact", name: "Alice", preview: "Hi, it's Alice" });
    const opened = await openRequest(bob, sealed);
    expect(opened?.from).toBe(alice.fingerprint);
    expect(opened?.body).toEqual({ t: "contact", name: "Alice", preview: "Hi, it's Alice" });
  });

  it("hide the sender from the server", async () => {
    const [alice, bob] = await Promise.all([person(), person()]);
    const sealed = await sealRequest(alice, bob.fingerprint, { t: "contact", name: "Alice" });
    expect(sealed).not.toContain(alice.fingerprint);
    expect(sealed).not.toContain("Alice");
  });

  it("can't be opened by anyone else, or forged in someone else's name", async () => {
    const [alice, bob, mallory] = await Promise.all([person(), person(), person()]);
    const sealed = await sealRequest(alice, bob.fingerprint, { t: "contact", name: "Alice" });
    expect(await openRequest(mallory, sealed)).toBeNull();
    // Mallory claims to be Alice: the inner layer only Alice and Bob can make won't open.
    const forged = await sealRequest({ ...mallory, fingerprint: alice.fingerprint }, bob.fingerprint, { t: "contact", name: "Alice" });
    expect(await openRequest(bob, forged)).toBeNull();
  });

  it("carry group invites", async () => {
    const [alice, bob] = await Promise.all([person(), person()]);
    const sealed = await sealRequest(alice, bob.fingerprint, { t: "vanishing_invite", name: "Alice", groupId: "g1", groupName: "Team" });
    expect((await openRequest(bob, sealed))?.body).toEqual({ t: "vanishing_invite", name: "Alice", groupId: "g1", groupName: "Team" });
  });

  it("use a 64-hex inbox address anyone can work out from the fingerprint", async () => {
    const bob = await person();
    expect(await requestInboxId(bob.fingerprint)).toMatch(/^[0-9a-f]{64}$/);
    expect(await requestInboxId(bob.fingerprint)).toBe(await requestInboxId(bob.fingerprint));
  });
});

describe("pending requests", () => {
  beforeEach(() => localStorage.clear());
  it("keep one entry per person and request type, refreshing the preview", () => {
    expect(addRequest({ from: "fp1", body: { t: "contact", name: "A", preview: "one" } })).toBe(true);
    expect(addRequest({ from: "fp1", body: { t: "contact", name: "A", preview: "two" } })).toBe(false);
    expect(addRequest({ from: "fp1", body: { t: "group_invite", name: "A", groupId: "g", groupName: "G" } })).toBe(true);
    expect(getRequests()).toHaveLength(2);
    expect(getRequests().find((r) => r.body.t === "contact")?.body).toMatchObject({ preview: "two" });
  });
});
