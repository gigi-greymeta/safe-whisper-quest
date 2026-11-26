import { describe, it, expect } from "vitest";
import { exportKeyPair, generateIdentityKeyPair, publicKeyToBase64 } from "@/crypto/keys";
import { newChain, newSigningKeys } from "@/lib/vanishing/crypto";
import { buildState, lockedOut, readState } from "@/lib/vanishing/state";

async function person(name: string) {
  const id = await exportKeyPair(await generateIdentityKeyPair());
  const fp = publicKeyToBase64(id.publicKey);
  const sign = await newSigningKeys();
  return { name, fp, id, sign, member: { fingerprint: fp, name, signPub: sign.pub } };
}

const secrets = { queueId: "a".repeat(64), chain: newChain(), adminToken: "t".repeat(64) };
const base = (p: { fp: string }) => ({ groupId: "g", creator: p.fp, invited: [] as string[] });

describe("vanishing group state", () => {
  it("is unreadable to the server: no names or fingerprints in what's stored", async () => {
    const [alice, bob] = await Promise.all([person("Alice"), person("Bob")]);
    const raw = await buildState({ ...base(alice), version: 1, name: "Secret Team", admins: [alice.fp], members: [alice.member, bob.member], updatedBy: alice.fp }, secrets, alice.sign.priv);
    expect(raw).not.toContain("Secret Team");
    expect(raw).not.toContain("Alice");
    expect(raw).not.toContain(alice.fp);
    expect(raw).not.toContain(bob.fp);
  });

  it("opens for each member; only admins get the admin token", async () => {
    const [alice, bob] = await Promise.all([person("Alice"), person("Bob")]);
    const raw = await buildState({ ...base(alice), version: 1, name: "Team", admins: [alice.fp], members: [alice.member, bob.member], updatedBy: alice.fp }, secrets, alice.sign.priv);
    const forBob = (await readState(raw, "g", [alice.fp], bob.id.privateKey))!;
    expect(forBob.body.name).toBe("Team");
    expect(forBob.secrets.queueId).toBe(secrets.queueId);
    expect(forBob.secrets.adminToken).toBeUndefined();
    expect((await readState(raw, "g", [alice.fp], alice.id.privateKey))?.secrets.adminToken).toBe(secrets.adminToken);
  });

  it("accepts changes from a promoted admin", async () => {
    const [alice, bob, cara] = await Promise.all([person("Alice"), person("Bob"), person("Cara")]);
    const raw = await buildState(
      { ...base(alice), version: 3, name: "Renamed by Bob", admins: [alice.fp, bob.fp], members: [alice.member, bob.member, cara.member], updatedBy: bob.fp },
      secrets,
      bob.sign.priv
    );
    expect((await readState(raw, "g", [alice.fp, bob.fp], cara.id.privateKey))?.body.name).toBe("Renamed by Bob");
  });

  it("rejects self-promotion, forged signatures and other groups", async () => {
    const [alice, bob, cara] = await Promise.all([person("Alice"), person("Bob"), person("Cara")]);
    const members = [alice.member, bob.member, cara.member];
    const selfPromoted = await buildState({ ...base(alice), version: 2, name: "Mine", admins: [alice.fp, bob.fp], members, updatedBy: bob.fp }, secrets, bob.sign.priv);
    expect(await readState(selfPromoted, "g", [alice.fp], cara.id.privateKey)).toBeNull();
    const forged = await buildState({ ...base(alice), version: 2, name: "Forged", admins: [alice.fp], members, updatedBy: alice.fp }, secrets, bob.sign.priv);
    expect(await readState(forged, "g", [alice.fp], cara.id.privateKey)).toBeNull();
    const genuine = await buildState({ ...base(alice), version: 2, name: "Real", admins: [alice.fp], members, updatedBy: alice.fp }, secrets, alice.sign.priv);
    expect(await readState(genuine, "other", [alice.fp], cara.id.privateKey)).toBeNull();
  });

  it("locks out a removed member", async () => {
    const [alice, bob, cara] = await Promise.all([person("Alice"), person("Bob"), person("Cara")]);
    const raw = await buildState(
      { ...base(alice), version: 4, name: "Team", admins: [alice.fp], members: [alice.member, cara.member], updatedBy: alice.fp },
      { ...secrets, queueId: "b".repeat(64) },
      alice.sign.priv
    );
    expect(await readState(raw, "g", [alice.fp], bob.id.privateKey)).toBeNull();
    expect(await lockedOut(raw, bob.id.privateKey)).toBe(true);
    expect(await lockedOut(raw, cara.id.privateKey)).toBe(false);
  });
});
