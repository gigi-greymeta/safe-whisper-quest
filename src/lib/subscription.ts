// Store subscriptions (Apple App Store / Google Play) — native apps only.
//
// Three plans: Free, Standard and Premium. Free needs no purchase; Standard and
// Premium are auto-renewing monthly subscriptions in one store subscription
// group, so moving between them is an upgrade/downgrade, not a second purchase.
// Billing talks directly to StoreKit / Play Billing via @capgo/native-purchases —
// no third-party billing service, and purchase data is never sent to the relay.
//
// The web build can't take payments, so it always runs as Free.
//
// Pricing lives in the store consoles, not here: the app always shows the
// localized price the store returns. See docs/store-compliance.md.

import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE, type Product, type Transaction } from "@capgo/native-purchases";

export type Tier = "free" | "standard" | "premium";
export type PaidTier = Exclude<Tier, "free">;

/** Product IDs — must be identical in App Store Connect and Play Console. */
export const PRODUCT_IDS: Record<PaidTier, string> = {
  standard: "phantom_standard_monthly",
  premium: "phantom_premium_monthly",
};
/** Google Play base plan ID used by both subscriptions (auto-renewing, monthly, no free trial). */
export const ANDROID_BASE_PLAN_ID = "monthly";

const TIER_RANK: Record<Tier, number> = { free: 0, standard: 1, premium: 2 };

/** Lowest plan that unlocks each gated feature. Delete-after-read is on every plan. */
export const FEATURE_TIER = {
  groupChats: "standard",
  calls: "premium",
  voiceFilter: "premium",
  scrambledMessages: "premium",
  appDisguise: "premium",
  panicPin: "premium",
} as const satisfies Record<string, Tier>;
export type Feature = keyof typeof FEATURE_TIER;

export const hasFeature = (tier: Tier, feature: Feature): boolean =>
  TIER_RANK[tier] >= TIER_RANK[FEATURE_TIER[feature]];

export const storeBillingAvailable = (): boolean => Capacitor.isNativePlatform();

function isActivePurchase(p: Partial<Transaction>, platform: string, now: number): boolean {
  if (p.revocationDate) return false;
  if (platform === "android") return p.purchaseState === "1";
  if (p.isActive === true) return true;
  return !!p.expirationDate && Date.parse(p.expirationDate) > now;
}

/**
 * Pure entitlement check, kept separate from the plugin so it can be tested.
 * Returns the highest plan with an active purchase.
 * - iOS: StoreKit reports isActive / expirationDate per subscription.
 * - Android: Play only returns current subscriptions; purchaseState "1" = purchased.
 */
export function tierFromPurchases(
  purchases: readonly Partial<Transaction>[],
  platform: string,
  now: number = Date.now()
): Tier {
  let tier: Tier = "free";
  for (const p of purchases) {
    if (!isActivePurchase(p, platform, now)) continue;
    if (p.productIdentifier === PRODUCT_IDS.premium) return "premium";
    if (p.productIdentifier === PRODUCT_IDS.standard) tier = "standard";
  }
  return tier;
}

export async function getActiveTier(): Promise<Tier> {
  if (!storeBillingAvailable()) return "free";
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  });
  return tierFromPurchases(purchases, Capacitor.getPlatform());
}

/**
 * Turn a store error into something a user (or a tester reading the screen) can act on.
 * Play Billing reports a subscription it can't return as "Product not found", which is a
 * store-setup or install problem, not a connection problem.
 */
export function storeErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  if (/product not found|no subscription offers|no pricing phases/i.test(detail))
    return `This subscription isn't available from the store yet. (${detail})`;
  if (/BILLING_UNAVAILABLE|FEATURE_NOT_SUPPORTED/i.test(detail))
    return `Store billing isn't available on this device or account. Sign in to the store app and try again. (${detail})`;
  if (/SERVICE_UNAVAILABLE|SERVICE_DISCONNECTED|NETWORK|timed? ?out/i.test(detail))
    return "Couldn't reach the store. Check your connection and try again.";
  return detail ? `The store returned an error: ${detail}` : "Couldn't reach the store. Check your connection and try again.";
}

/** Fetch the store listing for one paid plan. */
export async function getPlanProduct(tier: PaidTier): Promise<Product | null> {
  const productId = PRODUCT_IDS[tier];
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: [productId],
    productType: PURCHASE_TYPE.SUBS,
  });
  if (Capacitor.getPlatform() === "android") {
    // Play returns one entry per base plan; its identifier is the base plan ID.
    return products.find((p) => p.identifier === ANDROID_BASE_PLAN_ID) ?? products[0] ?? null;
  }
  return products.find((p) => p.identifier === productId) ?? null;
}

/** Buy (or switch to) a plan. Resolves to the plan now active. */
export async function purchasePlan(tier: PaidTier): Promise<Tier> {
  await NativePurchases.purchaseProduct({
    productIdentifier: PRODUCT_IDS[tier],
    planIdentifier: ANDROID_BASE_PLAN_ID,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
  });
  return getActiveTier();
}

export async function restorePurchases(): Promise<Tier> {
  await NativePurchases.restorePurchases();
  return getActiveTier();
}

export const manageSubscription = () => NativePurchases.manageSubscriptions();

/** iOS only: Apple's offer-code sheet (used for the owners' free codes). */
export const canRedeemOfferCode = () => Capacitor.getPlatform() === "ios";
export const redeemOfferCode = () => NativePurchases.presentOfferCodeRedeemSheet();

export function onSubscriptionChange(cb: () => void): () => void {
  if (!storeBillingAvailable()) return () => {};
  const handle = NativePurchases.addListener("transactionUpdated", cb);
  return () => {
    void handle.then((h) => h.remove());
  };
}
