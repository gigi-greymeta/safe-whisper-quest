import { AlertTriangle } from "lucide-react";

/**
 * Replaces the install prompt when we detect a private/incognito browsing
 * session. Tells the user their identity won't survive and that PWA install
 * is blocked, with a concrete next step.
 */
export default function EphemeralSessionWarning() {
  return (
    <div className="w-full max-w-sm mx-auto rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 flex items-start gap-3">
      <div className="rounded-lg bg-destructive/15 p-2 text-destructive shrink-0">
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">
          Private browsing detected
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1">
          Your identity won't survive closing this tab, and installing as an
          app is blocked here. Open Phantom in a normal browser window, then
          install it — the standalone app is sandboxed and persistent.
        </p>
      </div>
    </div>
  );
}