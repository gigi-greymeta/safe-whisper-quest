// Store subscription (Apple App Store / Google Play) — native apps only.
//
// The web build is free and never shows the paywall. On iOS/Android every
// user needs an active auto-renewing subscription. Billing talks directly to
// StoreKit / Play Billing via @capgo/native-purchases — no third-party
// billing service, and purchase data is never sent to the Phantom relay.
//
// Pricing lives in the store consoles, not here: the app always shows the
// localized price the store returns. See docs/store-compliance.md.

import { Capacitor } from "@capacitor/core";
import { NativePurchases, PURCHASE_TYPE, type Product, type Transaction } from "@capgo/native-purchases";

/** Subscription product ID — must be identical in App Store Connect and Play Console. */
export const SUBSCRIPTION_PRODUCT_ID = "phantom_premium_monthly";
/** Google Play base plan ID (auto-renewing, monthly, no free-trial offer). */
export const ANDROID_BASE_PLAN_ID = "monthly";

export const paywallRequired = (): boolean => Capacitor.isNativePlatform();

/**
 * Pure entitlement check, kept separate from the plugin so it can be tested.
 * - iOS: StoreKit reports isActive / expirationDate per subscription.
 * - Android: Play only returns current subscriptions; purchaseState "1" = purchased.
 */
export function isEntitled(
  purchases: readonly Partial<Transaction>[],
  platform: string,
  now: number = Date.now()
): boolean {
  return purchases.some((p) => {
    if (p.productIdentifier !== SUBSCRIPTION_PRODUCT_ID) return false;
    if (p.revocationDate) return false;
    if (platform === "android") return p.purchaseState === "1";
    if (p.isActive === true) return true;
    return !!p.expirationDate && Date.parse(p.expirationDate) > now;
  });
}

export async function hasActiveSubscription(): Promise<boolean> {
  if (!paywallRequired()) return true;
  const { purchases } = await NativePurchases.getPurchases({
    productType: PURCHASE_TYPE.SUBS,
    onlyCurrentEntitlements: true,
  });
  return isEntitled(purchases, Capacitor.getPlatform());
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

export async function getSubscriptionProduct(): Promise<Product | null> {
  const { products } = await NativePurchases.getProducts({
    productIdentifiers: [SUBSCRIPTION_PRODUCT_ID],
    productType: PURCHASE_TYPE.SUBS,
  });
  if (Capacitor.getPlatform() === "android") {
    return products.find((p) => p.identifier === ANDROID_BASE_PLAN_ID) ?? products[0] ?? null;
  }
  return products.find((p) => p.identifier === SUBSCRIPTION_PRODUCT_ID) ?? null;
}

export async function purchaseSubscription(): Promise<boolean> {
  await NativePurchases.purchaseProduct({
    productIdentifier: SUBSCRIPTION_PRODUCT_ID,
    planIdentifier: ANDROID_BASE_PLAN_ID,
    productType: PURCHASE_TYPE.SUBS,
    quantity: 1,
  });
  return hasActiveSubscription();
}

export async function restoreSubscription(): Promise<boolean> {
  await NativePurchases.restorePurchases();
  return hasActiveSubscription();
}

export const manageSubscription = () => NativePurchases.manageSubscriptions();

/** iOS only: Apple's offer-code sheet (used for the owners' free codes). */
export const canRedeemOfferCode = () => Capacitor.getPlatform() === "ios";
export const redeemOfferCode = () => NativePurchases.presentOfferCodeRedeemSheet();

export function onSubscriptionChange(cb: () => void): () => void {
  if (!paywallRequired()) return () => {};
  const handle = NativePurchases.addListener("transactionUpdated", cb);
  return () => {
    void handle.then((h) => h.remove());
  };
}
