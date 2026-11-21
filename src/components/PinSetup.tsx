import { useState } from "react";
import { Shield, Lock, Delete, AlertTriangle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPin, setPanicPin, type AuthMode } from "@/store/lock";
import { initVault } from "@/store/vault";
import { mirrorPhantomStorageToIDB } from "@/store/appPersist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PinSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
  mode?: "main" | "panic";
}

const MIN_PIN_LENGTH = 8;
const MAX_PIN_LENGTH = 12;
const MIN_PASSPHRASE_LENGTH = 12;

// ─── Entropy estimation ─────────────────────────────────────────────

function estimateEntropy(passphrase: string): number {
  let charsetSize = 0;
  if (/[a-z]/.test(passphrase)) charsetSize += 26;
  if (/[A-Z]/.test(passphrase)) charsetSize += 26;
  if (/[0-9]/.test(passphrase)) charsetSize += 10;
  if (/[^a-zA-Z0-9]/.test(passphrase)) charsetSize += 32;
  if (charsetSize === 0) return 0;
  const entropy = passphrase.length * Math.log2(charsetSize);
  // Penalize repeated characters
  const unique = new Set(passphrase.toLowerCase()).size;
  const uniqueRatio = unique / passphrase.length;
  return Math.round(entropy * Math.min(1, uniqueRatio + 0.3));
}

function getStrengthLevel(entropy: number): { label: string; color: string; width: string; description: string } {
  if (entropy < 40) return { label: "Weak", color: "bg-destructive", width: "w-1/4", description: "Easily crackable — add length and variety" };
  if (entropy < 60) return { label: "Fair", color: "bg-orange-500", width: "w-2/4", description: "Moderate protection — could be stronger" };
  if (entropy < 80) return { label: "Strong", color: "bg-yellow-500", width: "w-3/4", description: "Good protection against brute force" };
  return { label: "Excellent", color: "bg-primary", width: "w-full", description: "Very strong — resistant to offline attacks" };
}

const PassphraseStrength = ({ passphrase }: { passphrase: string }) => {
  const entropy = estimateEntropy(passphrase);
  const { label, color, width, description } = getStrengthLevel(entropy);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground">{entropy} bits entropy</span>
      </div>
      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-300", color, width)} />
      </div>
      <p className="text-[10px] text-muted-foreground">{description}</p>
    </div>
  );
};

const PinSetup = ({ onComplete, onSkip, mode = "main" }: PinSetupProps) => {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [pin, setPinState] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [firstPassphrase, setFirstPassphrase] = useState("");
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const isPanic = mode === "panic";

  // ─── PIN pad mode ─────────────────────────────────────────────────

  const handleDigit = (digit: string) => {
    if (pin.length >= MAX_PIN_LENGTH) return;
    const newPin = pin + digit;
    setPinState(newPin);
    setError(false);
    setErrorMsg("");
  };

  const handleDelete = () => {
    setPinState((p) => p.slice(0, -1));
    setError(false);
    setErrorMsg("");
  };

  const handlePinSubmit = () => {
    if (pin.length < MIN_PIN_LENGTH) {
      setError(true);
      setErrorMsg(`PIN must be at least ${MIN_PIN_LENGTH} digits`);
      return;
    }
    if (step === "create") {
      setFirstPin(pin);
      setPinState("");
      setStep("confirm");
    } else {
      if (pin === firstPin) {
        saveAndComplete(pin, "pin");
      } else {
        setError(true);
        setErrorMsg("PINs don't match — try again");
        setPinState("");
      }
    }
  };

  // ─── Passphrase mode ──────────────────────────────────────────────

  const handlePassphraseSubmit = () => {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
      setError(true);
      setErrorMsg(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
      return;
    }
    if (step === "create") {
      setFirstPassphrase(passphrase);
      setPassphrase("");
      setStep("confirm");
    } else {
      if (passphrase === firstPassphrase) {
        saveAndComplete(passphrase, "passphrase");
      } else {
        setError(true);
        setErrorMsg("Passphrases don't match — try again");
        setPassphrase("");
      }
    }
  };

  const saveAndComplete = async (value: string, aMode: AuthMode) => {
    if (isPanic) {
      await setPanicPin(value);
    } else {
      await setPin(value, aMode);
      await initVault(value);
    }
    await mirrorPhantomStorageToIDB();
    onComplete();
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  // ─── Auth mode chooser ────────────────────────────────────────────

  if (!authMode) {
    return (
      <div className="dark fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className={cn(
            "h-16 w-16 rounded-full flex items-center justify-center",
            isPanic ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {isPanic ? (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            ) : (
              <Lock className="h-7 w-7 text-primary" />
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {isPanic ? "Set Sentry Credential" : "Choose Lock Method"}
          </h1>
          <p className="text-sm text-muted-foreground text-center max-w-[280px]">
            {isPanic
              ? "Choose a decoy credential. Entering it silently wipes all data and shows a fresh install."
              : "Protect Phantom with a PIN or passphrase"}
          </p>
        </div>

        <div className="w-[280px] space-y-3">
          <button
            onClick={() => setAuthMode("pin")}
            className="w-full p-4 rounded-xl bg-card border text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">PIN Code</p>
                <p className="text-xs text-muted-foreground">{MIN_PIN_LENGTH}–{MAX_PIN_LENGTH} digit numeric code</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setAuthMode("passphrase")}
            className="w-full p-4 rounded-xl bg-card border text-left hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Passphrase</p>
                <p className="text-xs text-muted-foreground">{MIN_PASSPHRASE_LENGTH}+ characters, strongest option</p>
              </div>
            </div>
          </button>
        </div>

        {onSkip && (
          <Button variant="ghost" className="mt-6 text-muted-foreground" onClick={onSkip}>
            {isPanic ? "Cancel" : "Skip for now"}
          </Button>
        )}
      </div>
    );
  }

  // ─── Passphrase input ─────────────────────────────────────────────

  if (authMode === "passphrase") {
    const title = isPanic
      ? step === "create" ? "Set Sentry Passphrase" : "Confirm Sentry Passphrase"
      : step === "create" ? "Create Passphrase" : "Confirm Passphrase";

    const subtitle = isPanic
      ? step === "create"
        ? "Entering this passphrase will silently wipe ALL data"
        : "Enter the same sentry passphrase again"
      : step === "create"
        ? `Choose a passphrase (${MIN_PASSPHRASE_LENGTH}+ characters)`
        : "Enter the same passphrase again to confirm";

    return (
      <div className="dark fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className={cn(
            "h-16 w-16 rounded-full flex items-center justify-center",
            isPanic ? "bg-destructive/10" : "bg-primary/10"
          )}>
            {isPanic ? (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            ) : (
              <KeyRound className="h-7 w-7 text-primary" />
            )}
          </div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground text-center max-w-[280px]">{subtitle}</p>
        </div>

        <div className="w-[300px] space-y-4">
          <Input
            type="password"
            placeholder={step === "create" ? "Enter passphrase" : "Confirm passphrase"}
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(false);
              setErrorMsg("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handlePassphraseSubmit()}
            className="text-center"
            autoFocus
          />

          {step === "create" && passphrase.length > 0 && (
            <PassphraseStrength passphrase={passphrase} />
          )}

          {error && (
            <p className="text-sm text-destructive text-center animate-pulse">{errorMsg}</p>
          )}

          <Button
            onClick={handlePassphraseSubmit}
            disabled={passphrase.length < MIN_PASSPHRASE_LENGTH}
            className="w-full"
          >
            {step === "create" ? "Continue" : "Confirm"}
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={() => {
              setAuthMode(null);
              setStep("create");
              setPassphrase("");
              setFirstPassphrase("");
              setError(false);
            }}>
              Back
            </Button>
            {onSkip && step === "create" && (
              <Button variant="ghost" size="sm" className="flex-1 text-muted-foreground" onClick={onSkip}>
                {isPanic ? "Cancel" : "Skip"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-8 text-muted-foreground">
          <Shield className="h-3 w-3 text-primary" />
          <span className="text-[10px]">PBKDF2 key-stretched • AES-256-GCM vault</span>
        </div>
      </div>
    );
  }

  // ─── PIN pad ──────────────────────────────────────────────────────

  const title = isPanic
    ? step === "create" ? "Set Sentry PIN" : "Confirm Sentry PIN"
    : step === "create" ? "Create PIN" : "Confirm PIN";

  const subtitle = isPanic
    ? step === "create"
      ? `Choose an ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digit sentry PIN — entering it silently wipes all data`
      : "Enter the same sentry PIN again"
    : step === "create"
      ? `Choose an ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digit PIN`
      : "Enter the same PIN again to confirm";

  return (
    <div className="dark fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 mb-6">
        <div className={cn(
          "h-16 w-16 rounded-full flex items-center justify-center",
          isPanic ? "bg-destructive/10" : "bg-primary/10"
        )}>
          {isPanic ? (
            <AlertTriangle className="h-7 w-7 text-destructive" />
          ) : (
            <Lock className="h-7 w-7 text-primary" />
          )}
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground text-center max-w-[250px]">{subtitle}</p>
      </div>

      {/* PIN dots */}
      <div className="flex items-center gap-2 mb-2">
        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-full transition-all duration-200",
              i < pin.length
                ? error ? "bg-destructive scale-110"
                  : isPanic ? "bg-destructive scale-110" : "bg-primary scale-110"
                : i < MIN_PIN_LENGTH
                  ? "bg-muted border border-border"
                  : "bg-muted/40 border border-border/40"
            )}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mb-4">
        {pin.length}/{MIN_PIN_LENGTH} minimum
      </p>

      {error && (
        <p className="text-sm text-destructive mb-3 animate-pulse">{errorMsg}</p>
      )}

      <div className="grid grid-cols-3 gap-3 w-[260px]">
        {digits.map((digit, i) => {
          if (digit === "") return <div key={i} />;
          if (digit === "del") {
            return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={pin.length === 0}
                className="h-14 w-full rounded-2xl flex items-center justify-center text-foreground hover:bg-muted/50 transition-colors disabled:opacity-30"
              >
                <Delete className="h-5 w-5" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(digit)}
              className={cn(
                "h-14 w-full rounded-2xl flex items-center justify-center text-xl font-medium",
                "bg-card border text-foreground",
                "hover:bg-accent active:scale-95 transition-all"
              )}
            >
              {digit}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mt-4 w-[260px]">
        {pin.length >= MIN_PIN_LENGTH && (
          <Button onClick={handlePinSubmit} className="flex-1">
            {step === "create" ? "Continue" : "Confirm"}
          </Button>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => {
          setAuthMode(null);
          setStep("create");
          setPinState("");
          setFirstPin("");
          setError(false);
        }}>
          Back
        </Button>
        {onSkip && step === "create" && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip}>
            {isPanic ? "Cancel" : "Skip"}
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-4 text-muted-foreground">
        <Shield className="h-3 w-3 text-primary" />
        <span className="text-[10px]">PBKDF2 key-stretched • AES-256-GCM vault</span>
      </div>
    </div>
  );
};

export default PinSetup;
