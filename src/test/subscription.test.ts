import { describe, it, expect, vi } from "vitest";

vi.mock("@capgo/native-purchases", () => ({ NativePurchases: {}, PURCHASE_TYPE: { SUBS: "subs" } }));

import { hasFeature, tierFromPurchases, storeErrorMessage, PRODUCT_IDS } from "@/lib/subscription";

const now = Date.parse("2026-11-21T00:00:00Z");
const future = "2026-12-21T00:00:00Z";
const past = "2026-11-01T00:00:00Z";
const standard = PRODUCT_IDS.standard;
const premium = PRODUCT_IDS.premium;

describe("tierFromPurchases", () => {
  it("iOS: active or unexpired subscription unlocks its plan", () => {
    expect(tierFromPurchases([{ productIdentifier: premium, isActive: true }], "ios", now)).toBe("premium");
    expect(tierFromPurchases([{ productIdentifier: standard, expirationDate: future }], "ios", now)).toBe("standard");
  });

  it("iOS: expired, refunded or other products leave the user on Free", () => {
    expect(tierFromPurchases([{ productIdentifier: premium, isActive: false, expirationDate: past }], "ios", now)).toBe("free");
    expect(tierFromPurchases([{ productIdentifier: premium, isActive: true, revocationDate: past }], "ios", now)).toBe("free");
    expect(tierFromPurchases([{ productIdentifier: "something_else", isActive: true }], "ios", now)).toBe("free");
    expect(tierFromPurchases([], "ios", now)).toBe("free");
  });

  it("Android: only purchased state unlocks", () => {
    expect(tierFromPurchases([{ productIdentifier: standard, purchaseState: "1" }], "android", now)).toBe("standard");
    expect(tierFromPurchases([{ productIdentifier: premium, purchaseState: "2" }], "android", now)).toBe("free");
  });

  it("picks the highest active plan when both are present", () => {
    const both = [
      { productIdentifier: standard, purchaseState: "1" },
      { productIdentifier: premium, purchaseState: "1" },
    ];
    expect(tierFromPurchases(both, "android", now)).toBe("premium");
  });
});

describe("hasFeature", () => {
  it("Free has no group chats or Premium features", () => {
    expect(hasFeature("free", "groupChats")).toBe(false);
    expect(hasFeature("free", "panicPin")).toBe(false);
  });
  it("Standard adds group chats only", () => {
    expect(hasFeature("standard", "groupChats")).toBe(true);
    for (const f of ["calls", "voiceFilter", "scrambledMessages", "appDisguise", "panicPin"] as const)
      expect(hasFeature("standard", f)).toBe(false);
  });
  it("Premium has everything", () => {
    for (const f of ["groupChats", "calls", "voiceFilter", "scrambledMessages", "appDisguise", "panicPin"] as const)
      expect(hasFeature("premium", f)).toBe(true);
  });
});

describe("storeErrorMessage", () => {
  it("explains a product Play can't return instead of blaming the connection", () => {
    expect(storeErrorMessage(new Error("Product not found"))).toMatch(/isn't available from the store yet.*Product not found/);
  });
  it("flags billing unavailable on the device or account", () => {
    expect(storeErrorMessage(new Error("Billing error: BILLING_UNAVAILABLE"))).toMatch(/Sign in to the store app/);
  });
  it("keeps the connection message for real network failures", () => {
    expect(storeErrorMessage(new Error("SERVICE_UNAVAILABLE"))).toMatch(/Check your connection/);
  });
  it("shows unknown errors verbatim", () => {
    expect(storeErrorMessage(new Error("DEVELOPER_ERROR"))).toBe("The store returned an error: DEVELOPER_ERROR");
  });
});
