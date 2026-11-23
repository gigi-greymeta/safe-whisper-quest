// Current subscription plan, shared across the app.
//
// The last known plan is cached so a paying user doesn't see Free-plan
// gating flash on every launch while the store answers. The panic wipe clears
// localStorage, so the cache goes with everything else.

import { useSyncExternalStore } from "react";
import { getActiveTier, hasFeature, onSubscriptionChange, storeBillingAvailable, type Feature, type Tier } from "@/lib/subscription";

/**
 * Test builds (`npm run build:testing`) unlock every feature without a purchase, so
 * testers can try everything. Never upload a test build anywhere but a testing track.
 */
export const TEST_UNLOCK_ALL = import.meta.env.VITE_TEST_UNLOCK_ALL === "true";

const TIER_CACHE_KEY = "phantom_tier";

function readCachedTier(): Tier {
  if (TEST_UNLOCK_ALL) return "premium";
  if (!storeBillingAvailable()) return "free";
  try {
    const cached = localStorage.getItem(TIER_CACHE_KEY);
    if (cached === "standard" || cached === "premium") return cached;
  } catch {
    // Storage blocked: fall back to Free until the store answers.
  }
  return "free";
}

let currentTier: Tier = readCachedTier();
const listeners = new Set<() => void>();

export function setTier(tier: Tier): void {
  if (TEST_UNLOCK_ALL || tier === currentTier) return;
  currentTier = tier;
  try {
    if (tier === "free") localStorage.removeItem(TIER_CACHE_KEY);
    else localStorage.setItem(TIER_CACHE_KEY, tier);
  } catch {
    // Storage blocked: the plan still applies for this session.
  }
  listeners.forEach((l) => l());
}

export async function refreshTier(): Promise<void> {
  try {
    setTier(await getActiveTier());
  } catch {
    // Store unreachable: keep the last known plan rather than downgrading a paying user.
  }
}

/** Start watching the store. Call once at app start; returns a cleanup function. */
export function watchTier(): () => void {
  if (TEST_UNLOCK_ALL || !storeBillingAvailable()) return () => {};
  void refreshTier();
  const onVisible = () => document.visibilityState === "visible" && void refreshTier();
  document.addEventListener("visibilitychange", onVisible);
  const unsubscribe = onSubscriptionChange(() => void refreshTier());
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    unsubscribe();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getTier = () => currentTier;

export function useTier() {
  const tier = useSyncExternalStore(subscribe, getTier);
  return { tier, has: (feature: Feature) => hasFeature(tier, feature) };
}
