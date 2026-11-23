import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuthMode, hasPanicPin, isLockEnabled, verifyPanicPin, verifyPin } from "@/store/lock";
import { biometricsAvailable, MAX_UNLOCK_FAILURES, verifyWithBiometrics } from "@/lib/scramble";

interface UnscrambleDialogProps {
  open: boolean;
  /** Failed attempts already made on this message. */
  failures: number;
  onClose: () => void;
  onSuccess: () => void;
  /** Called after each failed attempt; the parent deletes the message at the limit. */
  onFailure: () => void;
}

const UnscrambleDialog = ({ open, failures, onClose, onSuccess, onFailure }: UnscrambleDialogProps) => {
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPin = isLockEnabled();
  const isPin = getAuthMode() === "pin";
  const remaining = MAX_UNLOCK_FAILURES - failures;

  useEffect(() => {
    if (!open) return;
    setCredential("");
    setError(null);
    let cancelled = false;
    void biometricsAvailable().then((ok) => {
      if (cancelled) return;
      setHasBiometrics(ok);
      if (ok) void tryBiometrics();
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fail = () => {
    const left = remaining - 1;
    setError(left > 0 ? `That didn't match. ${left} ${left === 1 ? "try" : "tries"} left before this message is deleted.` : null);
    onFailure();
  };

  const tryBiometrics = async () => {
    setBusy(true);
    try {
      const result = await verifyWithBiometrics();
      if (result === "ok") onSuccess();
      else if (result === "failed") fail();
    } finally {
      setBusy(false);
    }
  };

  const tryCredential = async () => {
    if (!credential) return;
    setBusy(true);
    try {
      // The Sentry Mode decoy works here too: it wipes the app, exactly as at the lock screen.
      if (hasPanicPin() && (await verifyPanicPin(credential))) {
        window.dispatchEvent(new CustomEvent("phantom:panic", { detail: credential }));
        return;
      }
      if (await verifyPin(credential)) onSuccess();
      else {
        setCredential("");
        fail();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>Unscramble message</DialogTitle>
          <DialogDescription>
            Confirm it's you to read this message. After {MAX_UNLOCK_FAILURES} failed attempts it's deleted from this device.
          </DialogDescription>
        </DialogHeader>

        {!hasPin && !hasBiometrics ? (
          <p className="text-sm text-muted-foreground">
            Turn on Screen Lock in Settings to set a PIN, then come back to read this message.
          </p>
        ) : (
          <div className="space-y-3">
            {hasBiometrics && (
              <Button className="w-full" variant="outline" disabled={busy} onClick={() => void tryBiometrics()}>
                <Fingerprint className="h-4 w-4 mr-2" /> Use fingerprint or face
              </Button>
            )}
            {hasPin && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void tryCredential();
                }}
              >
                <Input
                  type="password"
                  inputMode={isPin ? "numeric" : "text"}
                  autoComplete="off"
                  placeholder={isPin ? "PIN" : "Passphrase"}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  autoFocus={!hasBiometrics}
                />
                <Button type="submit" disabled={busy || !credential}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
                </Button>
              </form>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UnscrambleDialog;
