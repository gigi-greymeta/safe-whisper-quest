import { useState } from "react";
import { Lock, Delete, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPin, setPanicPin, verifyPin, verifyPanicPin, hasPanicPin, isLockEnabled, MIN_PIN_LENGTH, MAX_PIN_LENGTH } from "@/store/lock";
import { initVault } from "@/store/vault";
import { getIdentity } from "@/store/identity";
import { mirrorPhantomStorageToIDB } from "@/store/appPersist";
import { Button } from "@/components/ui/button";

interface PinSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
  mode?: "main" | "panic";
}

const PinSetup = ({ onComplete, onSkip, mode = "main" }: PinSetupProps) => {
  const [step, setStep] = useState<"create" | "confirm">("create");
  const [pin, setPinState] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const isPanic = mode === "panic";

  const fail = (message: string) => {
    setError(true);
    setErrorMsg(message);
    setPinState("");
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= MAX_PIN_LENGTH || !/^\d$/.test(digit)) return;
    setPinState(pin + digit);
    setError(false);
    setErrorMsg("");
  };

  const handleDelete = () => {
    setPinState((p) => p.slice(0, -1));
    setError(false);
    setErrorMsg("");
  };

  const handlePinSubmit = async () => {
    if (!/^\d+$/.test(pin) || pin.length < MIN_PIN_LENGTH) {
      setError(true);
      setErrorMsg(`PIN must be at least ${MIN_PIN_LENGTH} digits`);
      return;
    }
    if (step === "create") {
      // The two PINs must differ: unlock checks the Sentry PIN first, so a shared
      // value would wipe the app every time it was opened.
      if (isPanic && isLockEnabled() && (await verifyPin(pin))) {
        fail("Your Sentry PIN must be different from your app PIN");
        return;
      }
      if (!isPanic && hasPanicPin() && (await verifyPanicPin(pin))) {
        fail("Your app PIN must be different from your Sentry PIN");
        return;
      }
      setFirstPin(pin);
      setPinState("");
      setStep("confirm");
      return;
    }
    if (pin !== firstPin) {
      fail("PINs don't match — try again");
      return;
    }
    setSaving(true);
    try {
      await saveAndComplete(pin);
    } finally {
      setSaving(false);
    }
  };

  const saveAndComplete = async (value: string) => {
    if (isPanic) {
      const identity = getIdentity();
      await setPanicPin(
        value,
        identity ? { fingerprint: identity.publicKeyFingerprint, privateKey: identity.keyPair.privateKey } : undefined
      );
    } else {
      await setPin(value, "pin");
      await initVault(value);
    }
    await mirrorPhantomStorageToIDB();
    onComplete();
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  // ─── PIN pad ──────────────────────────────────────────────────────

  const title = isPanic
    ? step === "create" ? "Set Sentry PIN" : "Confirm Sentry PIN"
    : step === "create" ? "Create PIN" : "Confirm PIN";

  const subtitle = isPanic
    ? step === "create"
      ? `Choose a ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digit Sentry PIN. Entering it silently wipes all data.`
      : "Enter the same sentry PIN again"
    : step === "create"
      ? `Choose a ${MIN_PIN_LENGTH}–${MAX_PIN_LENGTH} digit PIN. Longer PINs are harder to guess.`
      : "Enter the same PIN again to confirm";

  return (
    <div className="dark fixed inset-0 z-[100] flex flex-col pt-[var(--safe-top)] pb-[var(--safe-bottom)] items-center justify-center bg-background">
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
          <Button onClick={() => void handlePinSubmit()} className="flex-1" disabled={saving}>
            {step === "create" ? "Continue" : "Confirm"}
          </Button>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        {step === "confirm" && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => {
            setStep("create");
            setPinState("");
            setFirstPin("");
            setError(false);
            setErrorMsg("");
          }}>
            Back
          </Button>
        )}
        {onSkip && step === "create" && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onSkip}>
            {isPanic ? "Cancel" : "Skip"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default PinSetup;
