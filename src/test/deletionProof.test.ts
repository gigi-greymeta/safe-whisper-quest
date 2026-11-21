import { describe, it, expect } from "vitest";
import { createDeletionProof, verifyDeletionProof, MAX_CLOCK_SKEW_MS } from "../../supabase/functions/_shared/deletionProof.ts";
import { publicKeyToBase64 } from "@/crypto/keys";

const ecdh = { name: "ECDH", namedCurve: "P-256" } as const;
const newPair = async () => {
  const kp = await crypto.subtle.generateKey(ecdh, true, ["deriveBits"]);
  return {
    pub: await crypto.subtle.exportKey("jwk", kp.publicKey),
    priv: await crypto.subtle.exportKey("jwk", kp.privateKey),
  };
};

describe("deletion proof", async () => {
  const server = await newPair();
  const me = await newPair();
  const other = await newPair();
  const fp = publicKeyToBase64(me.pub);
  const now = 1_800_000_000_000;

  it("accepts a proof from the identity owner", async () => {
    const proof = await createDeletionProof(me.priv, server.pub, fp, now);
    expect(await verifyDeletionProof(server.priv, fp, now, proof, now)).toBe(true);
  });

  it("rejects a proof made with someone else's key", async () => {
    const proof = await createDeletionProof(other.priv, server.pub, fp, now);
    expect(await verifyDeletionProof(server.priv, fp, now, proof, now)).toBe(false);
  });

  it("rejects a proof bound to a different timestamp or fingerprint", async () => {
    const proof = await createDeletionProof(me.priv, server.pub, fp, now);
    expect(await verifyDeletionProof(server.priv, fp, now + 1, proof, now)).toBe(false);
    expect(await verifyDeletionProof(server.priv, publicKeyToBase64(other.pub), now, proof, now)).toBe(false);
  });

  it("rejects stale proofs and garbage input", async () => {
    const old = now - MAX_CLOCK_SKEW_MS - 1;
    const proof = await createDeletionProof(me.priv, server.pub, fp, old);
    expect(await verifyDeletionProof(server.priv, fp, old, proof, now)).toBe(false);
    expect(await verifyDeletionProof(server.priv, "not-base64!", now, proof, now)).toBe(false);
    expect(await verifyDeletionProof(server.priv, fp, now, "%%%", now)).toBe(false);
  });
});
