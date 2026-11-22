import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import type { Product } from "@capgo/native-purchases";
import { ArrowLeft, Check, Loader2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTier, setTier } from "@/hooks/useTier";
import {
  canRedeemOfferCode,
  getPlanProduct,
  manageSubscription,
  purchasePlan,
  redeemOfferCode,
  restorePurchases,
  storeBillingAvailable,
  storeErrorMessage,
  type PaidTier,
  type Tier,
} from "@/lib/subscription";

interface PlanInfo {
  tier: Tier;
  name: string;
  /** Features this plan adds on top of the one before it. `soon` = not built yet. */
  features: { label: string; soon?: boolean }[];
}

const PLANS: PlanInfo[] = [
  {
    tier: "free",
    name: "Free",
    features: [
      { label: "End-to-end encrypted one-to-one chat" },
      { label: "Delete after read" },
      { label: "Screen lock" },
    ],
  },
  {
    tier: "standard",
    name: "Standard",
    features: [{ label: "Everything in Free" }, { label: "Encrypted group chats" }],
  },
  {
    tier: "premium",
    name: "Premium",
    features: [
      { label: "Everything in Standard" },
      { label: "Sentry Mode panic PIN" },
      { label: "Scrambled messages", soon: true },
      { label: "App disguise", soon: true },
      { label: "Voice calls with voice filter", soon: true },
    ],
  },
];

const isUserCancel = (e: unknown) => /cancel/i.test(e instanceof Error ? e.message : String(e));

const Paywall = () => {
  const navigate = useNavigate();
  const { tier: currentTier } = useTier();
  const [products, setProducts] = useState<Partial<Record<PaidTier, Product | null>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<PaidTier | "restore" | "redeem" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isIOS = Capacitor.getPlatform() === "ios";
  const storeName = isIOS ? "Apple ID" : "Google Play account";

  const loadProducts = useCallback(async () => {
    if (!storeBillingAvailable()) return;
    setLoading(true);
    setMessage(null);
    try {
      const [standard, premium] = await Promise.all([getPlanProduct("standard"), getPlanProduct("premium")]);
      setProducts({ standard, premium });
      if (!standard && !premium) setMessage("Subscriptions are unavailable right now. Check your connection and try again.");
    } catch (e) {
      console.error("Store product query failed", e);
      setMessage(storeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const run = async (kind: PaidTier | "restore" | "redeem", action: () => Promise<Tier>, noneFound: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      const tier = await action();
      setTier(tier);
      if (tier === "free") setMessage(noneFound);
    } catch (e) {
      if (!isUserCancel(e)) setMessage(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const choosePlan = (tier: PaidTier) => {
    // Play can't swap one subscription for another through our billing plugin, so buying a
    // second plan would bill for both. Send Android subscribers to cancel first.
    if (!isIOS && currentTier !== "free") {
      setMessage(
        `To switch plans, cancel your current plan in Google Play, then choose ${tier === "premium" ? "Premium" : "Standard"} here. You keep your current plan until the end of the period you've paid for.`
      );
      return;
    }
    void run(tier, () => purchasePlan(tier), "The purchase didn't complete. You haven't been charged.");
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex items-center gap-3 p-4 border-b bg-card/50 backdrop-blur-sm pt-[max(1rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="text-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">Plans</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 max-w-md w-full mx-auto flex flex-col gap-4">
        {!storeBillingAvailable() && (
          <p className="text-sm text-muted-foreground text-center">
            The web version runs on the Free plan. Standard and Premium are available in the Phantom app for iPhone and Android.
          </p>
        )}

        {PLANS.map((plan) => {
          const product = plan.tier === "free" ? null : products[plan.tier];
          const isCurrent = plan.tier === currentTier;
          return (
            <Card key={plan.tier} className={isCurrent ? "border-primary" : undefined}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-lg font-semibold text-foreground flex items-center gap-2">
                    {plan.name}
                    {isCurrent && <Badge variant="secondary">Current plan</Badge>}
                  </p>
                  <p className="text-sm text-foreground">
                    {plan.tier === "free" ? (
                      "Free"
                    ) : loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : product ? (
                      <>
                        <span className="text-xl font-semibold">{product.priceString}</span>
                        <span className="text-muted-foreground"> / month</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <ul className="space-y-2 text-sm text-foreground">
                  {plan.features.map((f) => (
                    <li key={f.label} className="flex gap-2">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>
                        {f.label}
                        {f.soon && <span className="text-xs text-muted-foreground"> (coming soon)</span>}
                      </span>
                    </li>
                  ))}
                </ul>

                {plan.tier !== "free" && !isCurrent && product && (
                  <Button className="w-full" size="lg" disabled={!!busy} onClick={() => choosePlan(plan.tier as PaidTier)}>
                    {busy === plan.tier ? <Loader2 className="h-4 w-4 animate-spin" /> : `Choose ${plan.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        {message && <p className="text-xs text-center text-destructive">{message}</p>}

        <div className="flex flex-col gap-1">
          {!loading && !products.standard && !products.premium && (
            <Button variant="outline" size="sm" onClick={loadProducts}>
              Try again
            </Button>
          )}
          {currentTier !== "free" && (
            <Button variant="ghost" size="sm" onClick={() => void manageSubscription()}>
              Manage or cancel subscription
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy}
            onClick={() => run("restore", restorePurchases, `No active subscription found for this ${storeName}.`)}
          >
            {busy === "restore" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Restore Purchases"}
          </Button>
          {canRedeemOfferCode() && (
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() =>
                run(
                  "redeem",
                  async () => {
                    await redeemOfferCode();
                    return restorePurchases();
                  },
                  "Once your code is redeemed, tap Restore Purchases."
                )
              }
            >
              <Ticket className="h-4 w-4 mr-2" /> Redeem Code
            </Button>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
          Standard and Premium are monthly auto-renewing subscriptions. Payment is charged to your {storeName} when you confirm the purchase.
          {isIOS
            ? " It renews automatically unless you cancel at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before that."
            : " It renews automatically each month until you cancel."}{" "}
          Manage or cancel at any time in your {isIOS ? "App Store account settings" : "Google Play subscriptions"}.
        </p>

        <p className="text-[11px] text-center space-x-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <a href="/legal/terms.html" className="text-primary underline">Terms of Service</a>
          <a href="/legal/privacy.html" className="text-primary underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
};

export default Paywall;
