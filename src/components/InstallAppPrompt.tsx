import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISS_KEY = "phantom_install_prompt_dismissed_at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari uses navigator.standalone; everyone else exposes display-mode media query.
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const mq = window.matchMedia?.("(display-mode: standalone)").matches === true;
  return iosStandalone || mq;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
}

function recentlyDismissed(): boolean {
  try {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && Date.now() - ts < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * "Install Phantom" prompt.
 *
 * - On Chrome/Edge/Android we capture `beforeinstallprompt` and trigger the
 *   native install dialog when the user taps Install.
 * - On iOS Safari (no native event) we show a small instructions dialog
 *   explaining the Share -> Add to Home Screen flow.
 * - Hidden when the app is already running standalone, or the user dismissed
 *   the banner within the last 7 days.
 */
export default function InstallAppPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHelpOpen, setIosHelpOpen] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no event — show our manual hint after a short delay.
    if (isIOS()) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setVisible(false);
  };

  const handleInstall = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {}
      setDeferred(null);
      setVisible(false);
      return;
    }
    // No native prompt available -> show manual instructions (iOS or unsupported browser).
    setIosHelpOpen(true);
  };

  if (!visible) return null;

  return (
    <>
      <div className="w-full max-w-sm mx-auto rounded-xl border bg-card px-4 py-3 flex items-center gap-3 shadow-sm">
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-card-foreground leading-tight">
            Install Phantom
          </p>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Run as a standalone app — faster, full-screen, off the URL bar.
          </p>
        </div>
        <Button size="sm" onClick={handleInstall} className="shrink-0">
          Install
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogContent className="dark max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Phantom to your Home Screen</DialogTitle>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex items-start gap-3">
              <span className="rounded-md bg-muted p-2 text-muted-foreground">
                <Share className="h-4 w-4" />
              </span>
              <span>
                Tap the <strong>Share</strong> button in your browser toolbar.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="rounded-md bg-muted p-2 text-muted-foreground">
                <Plus className="h-4 w-4" />
              </span>
              <span>
                Choose <strong>Add to Home Screen</strong>. Phantom will launch
                full-screen with its own icon.
              </span>
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setIosHelpOpen(false)} className="w-full">
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}