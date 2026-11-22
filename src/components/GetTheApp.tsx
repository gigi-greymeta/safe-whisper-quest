import LogoMark from "@/components/LogoMark";
import { Button } from "@/components/ui/button";
import type { MobileOS } from "@/lib/mobileBrowser";

// Phones are sent to the store apps rather than the web build: the store apps
// are where plans can be bought, and they protect keys better than a browser tab.

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=au.com.greymeta.phantom";
/** Set once the App Store listing exists, e.g. https://apps.apple.com/app/id1234567890 */
const APP_STORE_URL: string | undefined = import.meta.env.VITE_APP_STORE_URL || undefined;

interface GetTheAppProps {
  os: MobileOS;
}

const GetTheApp = ({ os }: GetTheAppProps) => {
  const stores = [
    { os: "ios" as const, label: "Download on the App Store", url: APP_STORE_URL },
    { os: "android" as const, label: "Get it on Google Play", url: PLAY_STORE_URL },
  ].sort((a, b) => (a.os === os ? -1 : b.os === os ? 1 : 0));

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex-1 p-4 max-w-md w-full mx-auto flex flex-col justify-center items-center gap-6 text-center">
        <LogoMark />
        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Get Phantom on your phone</h1>
          <p className="text-sm text-muted-foreground">
            End-to-end encrypted messaging with no phone number, no email and no tracking. On phones and tablets, Phantom runs as an app.
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          {stores.map((s) =>
            s.url ? (
              <Button key={s.os} asChild size="lg" className="w-full" variant={s.os === os ? "default" : "outline"}>
                <a href={s.url}>{s.label}</a>
              </Button>
            ) : (
              <p key={s.os} className="text-xs text-muted-foreground">Coming soon to the App Store</p>
            )
          )}
        </div>
        <p className="text-[11px] text-center space-x-3">
          <a href="/legal/terms.html" className="text-primary underline">Terms of Service</a>
          <a href="/legal/privacy.html" className="text-primary underline">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
};

export default GetTheApp;
