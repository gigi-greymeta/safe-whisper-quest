import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { deriveSafetyNumber, legacySafetyNumber } from "@/crypto/safetyNumber";
import { generateIdentityKeyPair, exportKeyPair, publicKeyToBase64 } from "@/crypto/keys";

const newFingerprint = async () => publicKeyToBase64((await exportKeyPair(await generateIdentityKeyPair())).publicKey);

/** Independent implementation with Node's SHA-512, to check the browser one. */
function referenceHalf(fingerprint: string): string {
  const { x, y } = JSON.parse(Buffer.from(fingerprint, "base64").toString());
  const key = Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]);
  let hash = createHash("sha512").update(Buffer.from([0, 0])).update(key).digest();
  for (let i = 0; i < 5200; i++) hash = createHash("sha512").update(hash).update(key).digest();
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) digits += String(hash.readUIntBE(chunk * 5, 5) % 100000).padStart(5, "0");
  return digits;
}

describe("safety numbers", () => {
  it("are identical on both phones and formatted as 12 groups of 5 digits", async () => {
    const [alice, bob] = await Promise.all([newFingerprint(), newFingerprint()]);
    const onAlice = await deriveSafetyNumber(alice, bob);
    const onBob = await deriveSafetyNumber(bob, alice);
    expect(onAlice).toBe(onBob);
    expect(onAlice).toMatch(/^(\d{5} ){11}\d{5}$/);
  });

  it("follow the SHA-512 x5200 construction exactly", async () => {
    const [alice, bob] = await Promise.all([newFingerprint(), newFingerprint()]);
    const expected = [referenceHalf(alice), referenceHalf(bob)].sort().join("");
    expect((await deriveSafetyNumber(alice, bob)).replace(/ /g, "")).toBe(expected);
  });

  it("change completely when either key is swapped", async () => {
    const [alice, bob, mallory] = await Promise.all([newFingerprint(), newFingerprint(), newFingerprint()]);
    const real = await deriveSafetyNumber(alice, bob);
    const attacked = await deriveSafetyNumber(alice, mallory);
    expect(attacked).not.toBe(real);
    // The attacker's half replaces the victim's half entirely, not a few digits.
    const realHalves = [real.replace(/ /g, "").slice(0, 30), real.replace(/ /g, "").slice(30)];
    const attackedDigits = attacked.replace(/ /g, "");
    expect(realHalves.filter((half) => attackedDigits.includes(half))).toHaveLength(1);
  });

  it("never matches the old format, so an outdated phone is recognised rather than trusted", async () => {
    const [alice, bob] = await Promise.all([newFingerprint(), newFingerprint()]);
    expect((await deriveSafetyNumber(alice, bob)).replace(/ /g, "")).not.toBe(legacySafetyNumber(alice, bob));
    expect(legacySafetyNumber(alice, bob)).toBe(legacySafetyNumber(bob, alice));
    expect(legacySafetyNumber(alice, bob)).toHaveLength(60);
  });
});
