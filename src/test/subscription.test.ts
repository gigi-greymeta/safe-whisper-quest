import { describe, it, expect, vi } from "vitest";

vi.mock("@capgo/native-purchases", () => ({ NativePurchases: {}, PURCHASE_TYPE: { SUBS: "subs" } }));

import { isEntitled, SUBSCRIPTION_PRODUCT_ID as id } from "@/lib/subscription";

const now = Date.parse("2026-11-21T00:00:00Z");
const future = "2026-12-21T00:00:00Z";
const past = "2026-11-01T00:00:00Z";

describe("isEntitled", () => {
  it("iOS: active or unexpired subscription unlocks", () => {
    expect(isEntitled([{ productIdentifier: id, isActive: true }], "ios", now)).toBe(true);
    expect(isEntitled([{ productIdentifier: id, expirationDate: future }], "ios", now)).toBe(true);
  });

  it("iOS: expired, refunded or other products do not unlock", () => {
    expect(isEntitled([{ productIdentifier: id, isActive: false, expirationDate: past }], "ios", now)).toBe(false);
    expect(isEntitled([{ productIdentifier: id, isActive: true, revocationDate: past }], "ios", now)).toBe(false);
    expect(isEntitled([{ productIdentifier: "something_else", isActive: true }], "ios", now)).toBe(false);
    expect(isEntitled([], "ios", now)).toBe(false);
  });

  it("Android: only purchased state unlocks", () => {
    expect(isEntitled([{ productIdentifier: id, purchaseState: "1" }], "android", now)).toBe(true);
    expect(isEntitled([{ productIdentifier: id, purchaseState: "2" }], "android", now)).toBe(false);
  });
});
