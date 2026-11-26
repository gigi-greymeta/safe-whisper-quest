import { describe, it, expect, vi } from "vitest";

const calls = vi.hoisted(() => [] as string[]);
const track = (name: string) => () => {
  calls.push(name);
};
vi.mock("@/store/identityPersist", () => ({ clearIdentityFromIDB: vi.fn(async () => calls.push("identity mirror")) }));
vi.mock("@/store/contactsPersist", () => ({ clearContactsFromIDB: vi.fn(async () => calls.push("contacts mirror")) }));
vi.mock("@/store/outboxPersist", () => ({ clearOutbox: vi.fn(async () => calls.push("outbox")) }));
vi.mock("@/store/appPersist", () => ({ clearPhantomStorageFromIDB: vi.fn(async () => calls.push("app mirror")) }));
vi.mock("@/store/vault", () => ({ clearVault: () => calls.push("vault") }));
vi.mock("@/store/lock", () => ({ secureEraseAll: () => calls.push("secure erase"), disableLock: () => calls.push("lock") }));
vi.mock("@/store/keyPinning", () => ({ clearPinnedKeys: () => calls.push("pins") }));
vi.mock("@/store/sessionLock", () => ({ clearSessionUnlock: () => calls.push("session") }));
vi.mock("@/lib/deviceWipe", () => ({ wipeDeviceCaches: vi.fn(async () => calls.push("caches")) }));

import { eraseAllLocalData } from "@/lib/eraseDevice";
import { isWiping } from "@/store/wipeGuard";

describe("eraseAllLocalData", () => {
  it("stops the app first, then clears the identity and contact mirrors and everything else", async () => {
    localStorage.setItem("phantom_identity", "x");
    await eraseAllLocalData(track("burn"));
    expect(calls.indexOf("burn")).toBeLessThan(calls.indexOf("identity mirror"));
    for (const step of ["identity mirror", "contacts mirror", "app mirror", "outbox", "vault", "caches"]) expect(calls).toContain(step);
    expect(localStorage.getItem("phantom_identity")).toBeNull();
  });

  it("keeps going when a step fails", async () => {
    calls.length = 0;
    await eraseAllLocalData(() => {
      throw new Error("boom");
    });
    expect(calls).toContain("caches");
  });

  it("blocks any further saves once a wipe has started", async () => {
    await eraseAllLocalData();
    expect(isWiping()).toBe(true);
  });
});
