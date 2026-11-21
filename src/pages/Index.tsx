import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCrypto } from "@/hooks/useCrypto";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import KeyDisplay from "@/components/KeyDisplay";
import InstallAppPrompt from "@/components/InstallAppPrompt";
import EphemeralSessionWarning from "@/components/EphemeralSessionWarning";
import FirstRunIntro, { hasSeenFirstRun } from "@/components/FirstRunIntro";
import RelayStatusIndicator from "@/components/RelayStatusIndicator";
import { useEphemeralSession } from "@/hooks/useEphemeralSession";
import { isLockEnabled } from "@/store/lock";
import { hasVault } from "@/store/vault";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import phantomLogo from "@/assets/phantom-logo.jpg";
import { enableDebugConsole, disableDebugConsole, isDebugConsoleEnabled } from "@/lib/debugConsole";
import { toast } from "@/hooks/use-toast";

let __logoTapCount = 0;
let __logoTapTimer: ReturnType<typeof setTimeout> | null = null;
const handleLogoSecretTap = () => {
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

const LogoMark = ({ size = 96 }: { size?: number }) => (
  <button
    type="button"
    onClick={handleLogoSecretTap}
    aria-label="Phantom"
    className="group relative rounded-2xl transition-all duration-500 ease-out hover:scale-[1.03]"
    style={{ width: size, height: size }}
  >
    <div
      aria-hidden
      className="absolute -inset-3 rounded-3xl opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      style={{ background: "radial-gradient(closest-side, hsl(var(--primary) / 0.55), transparent 70%)" }}
    />
    <img
      src={phantomLogo}
      alt="Phantom Chat logo"
      width={size}
      height={size}
      className="relative h-full w-full rounded-2xl object-cover ring-1 ring-primary/20 transition-shadow duration-500 group-hover:ring-primary/60"
      style={{ boxShadow: "0 0 0 1px hsl(var(--primary) / 0.15), 0 10px 40px -10px hsl(var(--primary) / 0.45)" }}
    />
  </button>
);

const Index = () => {
  const { state, setupIdentity, signOut, retryFailedOutbox } = useCrypto();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [error, setError] = useState<string | null>(null);
  const ephemeral = useEphemeralSession();
  const [showIntro, setShowIntro] = useState(false);

  // Show the 3-slide intro on the very first visit on this device. We show
  // it regardless of whether an identity already exists (e.g. restored from a
  // vault on another device) — the explanations about device-binding, PWA
  // installation and vault backup are still relevant for a brand-new install.
  useEffect(() => {
    if (!hasSeenFirstRun()) setShowIntro(true);
  }, []);

  // "Unlock Phantom" can only restore an identity that was created on THIS
  // device/browser (vault or lock present locally). Identities are device-bound
  // by design — there is no server-side account to sign into from elsewhere.
  const canUnlockExisting = hasVault() || isLockEnabled();

  // If identity exists, show identity card and navigate options
  if (state.identity) {
    return (
      <div className="dark flex flex-col min-h-screen bg-background">
        <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-6">
          <div className="flex flex-col items-center gap-3 text-primary">
            <LogoMark size={88} />
            <h1 className="text-2xl font-bold text-foreground">Phantom Chat</h1>
          </div>

          <div className="w-full max-w-sm space-y-4">
            <div className="text-center space-y-1">
              <p className="text-lg font-semibold text-foreground">{state.identity.displayName}</p>
              <p className="text-xs text-muted-foreground">Your identity is secured locally</p>
              <RelayStatusIndicator
                status={state.relayStatus}
                pendingCount={state.outboxPending}
                failedCount={state.outboxFailed}
                onRetry={retryFailedOutbox}
              />
            </div>

            <KeyDisplay fingerprint={state.identity.publicKeyFingerprint} compact />

            <div className="space-y-2 pt-2">
            <Button onClick={() => navigate("/contacts")} className="w-full" size="lg">
              Open Contacts
            </Button>
            <Button onClick={() => navigate("/settings")} variant="outline" className="w-full text-primary hover:text-primary">
              Settings
            </Button>
            {(isLockEnabled() || hasVault()) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full text-destructive hover:text-destructive">
                    <LogOut className="h-4 w-4 mr-2" /> Sign Out
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="dark">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out of Phantom?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your encrypted vault stays on this device. You will
                      need your passcode to come back in.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void signOut()}>
                      Sign Out
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
              <Button
                onClick={() => navigate("/reset")}
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                size="sm"
              >
                Reset & Start Over
              </Button>
            </div>

            {ephemeral ? <EphemeralSessionWarning /> : <InstallAppPrompt />}
          </div>
        </div>
      {showIntro && <FirstRunIntro onDone={() => setShowIntro(false)} />}
      </div>
    );
  }

  const handleCreate = async () => {
    if (!displayName.trim()) return;
    const name = displayName.trim();
    setLoading(true);
    setError(null);
    try {
      // Check directory for an existing identity with the same display name
      try {
        const { searchUsers } = await import("@/services/relay");
        const existing = await searchUsers(name);
        const exact = existing.find(
          (u: any) => (u.display_name || "").toLowerCase() === name.toLowerCase()
        );
        if (exact) {
          setError(
            `"${name}" is already registered. Choose a different name — each identity must be unique.`
          );
          setLoading(false);
          return;
        }
      } catch {
        // Directory check failed (offline) — allow creation; fingerprint guarantees uniqueness anyway.
      }
      await setupIdentity(name);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dark flex flex-col min-h-screen bg-background">
      <div className="flex-1 flex flex-col items-center justify-center p-6 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <LogoMark size={104} />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Phantom Chat</h1>
          <p className="text-muted-foreground text-sm max-w-xs mx-auto">
            End-to-end encrypted messaging. No accounts. No tracking. No compromises.
          </p>
        </div>

        {/* Setup */}
        <div className="w-full max-w-xs space-y-3">
          {mode === "choose" ? (
            <>
              {canUnlockExisting && (
                <Button
                  onClick={() => {
                    // A vault/lock exists locally — raise the App-level LockScreen.
                    window.dispatchEvent(new Event("phantom:lock"));
                  }}
                  className="w-full text-primary"
                  size="lg"
                  variant="outline"
                >
                  Unlock Phantom
                </Button>
              )}
              <Button
                onClick={() => {
                  setMode("create");
                  setError(null);
                }}
                className="w-full"
                size="lg"
              >
                Create Identity
              </Button>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Identities are device-bound. Your keypair is generated and stored
                only on this device — it can't be signed into from another
                browser. Use the same browser you created the identity in, or
                export a vault backup from Settings to move it.
              </p>
            </>
          ) : (
            <>
              <Input
                placeholder="Choose a unique display name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                className="text-center"
                autoFocus
              />
              {error && (
                <p className="text-[11px] text-destructive text-center">{error}</p>
              )}
              <Button
                onClick={handleCreate}
                disabled={!displayName.trim() || loading}
                className="w-full"
                size="lg"
              >
                {loading ? "Checking & Generating Keys..." : "Create Identity"}
              </Button>
              <Button
                onClick={() => {
                  setMode("choose");
                  setError(null);
                  setDisplayName("");
                }}
                variant="ghost"
                className="w-full"
                size="sm"
                disabled={loading}
              >
                Back
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Names are checked against the directory to avoid duplicates.
              </p>
              <p className="text-[10px] text-muted-foreground text-center">
                By creating an identity you agree to the{" "}
                <a href="/legal/terms.html" className="underline">Terms of Service</a> and{" "}
                <a href="/legal/privacy.html" className="underline">Privacy Policy</a>.
              </p>
            </>
          )}
        </div>

        {ephemeral ? <EphemeralSessionWarning /> : <InstallAppPrompt />}
      </div>
      {showIntro && <FirstRunIntro onDone={() => setShowIntro(false)} />}
    </div>
  );
};

export default Index;
