// Tapping the Phantom logo five times within a few seconds turns the on-screen debug console on or off.
import { enableDebugConsole, disableDebugConsole, isDebugConsoleEnabled } from "@/lib/debugConsole";
import { toast } from "@/hooks/use-toast";

let __logoTapCount = 0;
let __logoTapTimer: ReturnType<typeof setTimeout> | null = null;
export const handleLogoSecretTap = () => {
  __logoTapCount += 1;
  if (__logoTapTimer) clearTimeout(__logoTapTimer);
  __logoTapTimer = setTimeout(() => {
    __logoTapCount = 0;
  }, 2500);
  if (__logoTapCount >= 5) {
    __logoTapCount = 0;
    if (__logoTapTimer) clearTimeout(__logoTapTimer);
    if (isDebugConsoleEnabled()) {
      disableDebugConsole();
      try { toast({ title: "Debug console disabled" }); } catch {}
    } else {
      void enableDebugConsole()
        .then(() => { try { toast({ title: "Debug console enabled", description: "Tap the bug icon to view logs." }); } catch {} })
        .catch(() => { try { toast({ title: "Failed to load debug console", variant: "destructive" }); } catch {} });
    }
  }
};
