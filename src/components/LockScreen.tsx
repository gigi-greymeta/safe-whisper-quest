import { useState, useEffect } from "react";
import { Shield, Lock, Delete, AlertTriangle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { verifyPin, verifyPanicPin, hasPanicPin, recordUnlock, isLockedOut, getAuthMode } from "@/store/lock";
import { markSessionUnlocked } from "@/store/sessionLock";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LogoMark from "@/components/LogoMark";

interface LockScreenProps {
  onUnlock: (credential: string) => void | boolean | Promise<void | boolean>;
  onPanicWipe?: (credential: string) => void;
  /** Hide the Phantom name and logo (app disguise is on). */
  plain?: boolean;
}

const LockScreen = ({ onUnlock, onPanicWipe, plain }: LockScreenProps) => {
  const [pin, setPin] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const authMode = getAuthMode();
  const maxPinLength = 12;

  useEffect(() => {
    const check = () => {
      const { locked, remainingMs } = isLockedOut();
      setLockoutRemaining(locked ? remainingMs : 0);
    };
    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLocked = lockoutRemaining > 0;

  const checkCredential = async (value: string) => {
    setChecking(true);
    try {
      if (hasPanicPin()) {
        const isPanic = await verifyPanicPin(value);
        if (isPanic) {
          onPanicWipe?.(value);
          return;
        }
      }

      const valid = await verifyPin(value);
      if (valid) {
        const unlockResult = await onUnlock(value);
        if (unlockResult === false) {
          setError(true);
          if (authMode === "pin") setPin("");
          else setPassphrase("");
          return;
        }
        recordUnlock();
        markSessionUnlocked();
      } else {
        setError(true);
        if (authMode === "pin") setPin("");
        else setPassphrase("");
      }
    } finally {
      setChecking(false);
    }
  };

  const formatLockout = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    if (s >= 60) return `${Math.ceil(s / 60)}m`;
    return `${s}s`;
  };

  // ─── Passphrase unlock ────────────────────────────────────────────

  if (authMode === "passphrase") {
    return (
      <div className="dark fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 mb-8">
          {plain ? <Lock className="h-12 w-12 text-muted-foreground" /> : <LogoMark size={72} />}
          <h1 className="text-xl font-semibold text-foreground">{plain ? "Locked" : "Phantom Locked"}</h1>
          <p className="text-sm text-muted-foreground">Enter your passphrase to unlock</p>
        </div>

        {isLocked && (
          <div className="flex items-center gap-1.5 mb-4 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-medium">
              Too many attempts. Try again in {formatLockout(lockoutRemaining)}
            </p>
          </div>
        )}

        {error && !isLocked && (
          <p className="text-sm text-destructive mb-4 animate-pulse">Incorrect passphrase</p>
        )}

        <div className="w-[300px] space-y-3">
          <Input
            type="password"
            placeholder="Enter passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              setError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && !isLocked && passphrase.length > 0 && checkCredential(passphrase)}
            disabled={isLocked || checking}
            className="text-center"
            autoFocus
          />
          <Button
            onClick={() => checkCredential(passphrase)}
            disabled={isLocked || checking || passphrase.length === 0}
            className="w-full"
          >
            {checking ? "Verifying..." : "Unlock"}
          </Button>
        </div>

        <div className="flex items-center gap-1.5 mt-8 text-muted-foreground">
          <Shield className="h-3 w-3 text-primary" />
          <span className="text-[10px]">End-to-end encrypted</span>
        </div>
      </div>
    );
  }

  // ─── PIN unlock ───────────────────────────────────────────────────

  const handleDigit = (digit: string) => {
    if (pin.length >= maxPinLength || isLocked) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError(false);
  };

  const handlePinSubmit = () => {
    if (pin.length >= 8) {
      checkCredential(pin);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="dark fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 mb-6">
        {plain ? <Lock className="h-12 w-12 text-muted-foreground" /> : <LogoMark size={72} />}
        <h1 className="text-xl font-semibold text-foreground">{plain ? "Locked" : "Phantom Locked"}</h1>
        <p className="text-sm text-muted-foreground">Enter your PIN to unlock</p>
      </div>

      <div className="flex items-center gap-2 mb-2">
        {Array.from({ length: maxPinLength }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-3 w-3 rounded-full transition-all duration-200",
              i < pin.length
                ? error
                  ? "bg-destructive scale-110"
                  : "bg-primary scale-110"
                : i < 8
                  ? "bg-muted border border-border"
                  : "bg-muted/40 border border-border/40"
            )}
          />
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground mb-4">
        {pin.length}/8 minimum
      </p>

      {isLocked && (
        <div className="flex items-center gap-1.5 mb-4 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-sm font-medium">
            Too many attempts. Try again in {formatLockout(lockoutRemaining)}
          </p>
        </div>
      )}

      {error && !isLocked && (
        <p className="text-sm text-destructive mb-3 animate-pulse">Incorrect PIN</p>
      )}

      <div className="grid grid-cols-3 gap-3 w-[260px]">
        {digits.map((digit, i) => {
          if (digit === "") return <div key={i} />;
          if (digit === "del") {
            return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={pin.length === 0 || isLocked}
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
              disabled={checking || isLocked}
              className={cn(
                "h-14 w-full rounded-2xl flex items-center justify-center text-xl font-medium",
                "bg-card border text-foreground",
                "hover:bg-accent active:scale-95 transition-all",
                "disabled:opacity-50"
              )}
            >
              {digit}
            </button>
          );
        })}
      </div>

      {pin.length >= 8 && (
        <Button onClick={handlePinSubmit} className="mt-4 w-[260px]" disabled={checking || isLocked}>
          {checking ? "Verifying..." : "Unlock"}
        </Button>
      )}

      <div className="flex items-center gap-1.5 mt-6 text-muted-foreground">
        <Shield className="h-3 w-3 text-primary" />
        <span className="text-[10px]">End-to-end encrypted</span>
      </div>
    </div>
  );
};

export default LockScreen;
