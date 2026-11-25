import { describe, it, expect } from "vitest";
import { parseIdentityCode, safetyDigits } from "@/lib/qrCodes";
import { generateIdentityKeyPair, exportKeyPair, publicKeyToBase64 } from "@/crypto/keys";

describe("identity QR codes", () => {
  it("reads a contact's code back to their exact public key", async () => {
    const { publicKey } = await exportKeyPair(await generateIdentityKeyPair());
    const code = publicKeyToBase64(publicKey);
    const scanned = parseIdentityCode(code);
    expect(scanned?.fingerprint).toBe(code);
    expect(scanned?.publicKey.x).toBe(publicKey.x);
    expect(scanned?.publicKey.y).toBe(publicKey.y);
  });

  it("tolerates whitespace a camera app may add", async () => {
    const { publicKey } = await exportKeyPair(await generateIdentityKeyPair());
    const code = publicKeyToBase64(publicKey);
    expect(parseIdentityCode(`  ${code.slice(0, 40)}\n${code.slice(40)} `)?.fingerprint).toBe(code);
  });

  it("rejects anything that isn't a Phantom contact key", () => {
    expect(parseIdentityCode("https://example.com")).toBeNull();
    expect(parseIdentityCode("12345 67890 12345")).toBeNull();
    expect(parseIdentityCode(btoa(JSON.stringify({ kty: "RSA", n: "abc", e: "AQAB" })))).toBeNull();
    expect(parseIdentityCode(btoa(JSON.stringify({ kty: "EC", crv: "P-256", x: "a" })))).toBeNull();
  });
});

describe("safety number QR codes", () => {
  it("compares on digits only", () => {
    const spaced = "12345 67890 ".repeat(6).trim();
    expect(safetyDigits(spaced)).toBe("1234567890".repeat(6));
    expect(safetyDigits(spaced)).toHaveLength(60);
  });
});
