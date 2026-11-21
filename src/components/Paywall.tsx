import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import type { Product } from "@capgo/native-purchases";
import { Loader2, Lock, ShieldCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import LogoMark from "@/components/LogoMark";
import { useCrypto } from "@/hooks/useCrypto";
import {
  canRedeemOfferCode,
  getSubscriptionProduct,
  purchaseSubscription,
  redeemOfferCode,
  restoreSubscription,
} from "@/lib/subscription";

interface PaywallProps {
  onEntitled: () => void;
}

const isUserCancel = (e: unknown) => /cancel/i.test(e instanceof Error ? e.message : String(e));

const Paywall = ({ onEntitled }: PaywallProps) => {
  const navigate = useNavigate();
  const { state } = useCrypto();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"buy" | "restore" | "redeem" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isIOS = Capacitor.getPlatform() === "ios";
  const storeName = isIOS ? "Apple ID" : "Google Play account";

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const p = await getSubscriptionProduct();
      setProduct(p);
      if (!p) setMessage("Subscriptions are unavailable right now. Check your connection and try again.");
    } catch {
      setMessage("Couldn't reach the store. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const run = async (kind: "buy" | "restore" | "redeem", action: () => Promise<boolean>, noneFound: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      if (await action()) onEntitled();
      else setMessage(noneFound);
    } catch (e) {
      if (!isUserCancel(e)) setMessage(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex-1 overflow-y-auto p-4 max-w-md w-full mx-auto flex flex-col justify-center gap-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-center gap-3 text-center">
          <LogoMark />
          <h1 className="text-xl font-semibold text-foreground">Phantom Premium</h1>
          <p className="text-sm text-muted-foreground">
            End-to-end encrypted messaging with no phone number, no email and no tracking.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Unlimited encrypted chats and groups</li>
              <li className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Forward secrecy and disappearing messages</li>
              <li className="flex gap-2"><Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" /> Screen lock and Sentry Mode</li>
            </ul>

            <div className="text-center">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" />
              ) : product ? (
                <p className="text-2xl font-semibold text-foreground">
                  {product.priceString}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
              ) : null}
            </div>

            {product ? (
              <Button
                className="w-full"
                size="lg"
                disabled={!!busy}
                onClick={() => run("buy", purchaseSubscription, "The purchase didn't complete. You haven't been charged.")}
              >
                {busy === "buy" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Subscribe"}
              </Button>
            ) : (
              !loading && (
                <Button className="w-full" size="lg" variant="outline" onClick={loadProduct}>
                  Try again
                </Button>
              )
            )}

            {message && <p className="text-xs text-center text-destructive">{message}</p>}

            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => run("restore", restoreSubscription, `No active subscription found for this ${storeName}.`)}
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
                        return restoreSubscription();
                      },
                      "Once your code is redeemed, tap Restore Purchases."
                    )
                  }
                >
                  <Ticket className="h-4 w-4 mr-2" /> Redeem Code
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
          Monthly auto-renewing subscription. Payment is charged to your {storeName} when you confirm the purchase.
          {isIOS
            ? " It renews automatically unless you cancel at least 24 hours before the end of the current period, and your account is charged for renewal within 24 hours before that."
            : " It renews automatically each month until you cancel."}{" "}
          Manage or cancel at any time in your {isIOS ? "App Store account settings" : "Google Play subscriptions"}.
        </p>

        <p className="text-[11px] text-center space-x-3">
          <a href="/legal/terms.html" className="text-primary underline">Terms of Service</a>
          <a href="/legal/privacy.html" className="text-primary underline">Privacy Policy</a>
          {state.identity && (
            <button type="button" className="text-muted-foreground underline" onClick={() => navigate("/settings/delete-account")}>
              Delete Account
            </button>
          )}
        </p>
      </div>
    </div>
  );
};

export default Paywall;
