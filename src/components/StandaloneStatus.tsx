import { useEffect, useState } from "react";
import { Smartphone, AlertTriangle, CheckCircle2 } from "lucide-react";

/**
 * Quick in-app check that confirms whether Phantom is actually running as an
 * installed PWA (standalone display mode) or still inside a regular browser
 * tab. If the user thinks they installed but the app is still in the browser,
 * we surface a small fallback hint.
 *
 * - Installed (standalone)  → small green "Installed app" pill
 * - Browser tab             → muted info pill explaining that install hasn't
 *                             applied yet (with retry hint)
 */
export default function StandaloneStatus() {
  const [standalone, setStandalone] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ios = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const mq = window.matchMedia?.("(display-mode: standalone)");
    const update = () => setStandalone(ios || mq?.matches === true);
    update();
    mq?.addEventListener?.("change", update);
    return () => mq?.removeEventListener?.("change", update);
  }, []);

  if (standalone === null) return null;

  if (standalone) {
    return (
      <div className="w-full max-w-sm mx-auto rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-[11px] text-primary leading-tight">
          Standalone mode active.
        </span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm mx-auto rounded-lg border bg-card px-3 py-2 flex items-start gap-2">
      <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-card-foreground leading-tight flex items-center gap-1">
          <Smartphone className="h-3 w-3" /> Browser mode
        </p>
      </div>
    </div>
  );
}