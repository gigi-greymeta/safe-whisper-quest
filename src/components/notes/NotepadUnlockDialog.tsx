import { useEffect, useState } from "react";
import { Fingerprint, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAuthMode, hasNotepadPin, hasPanicPin, isLockEnabled, verifyNotepadPin, verifyPanicPin, verifyPin } from "@/store/lock";
import { biometricsAvailable, verifyWithBiometrics } from "@/lib/scramble";
import type { NotepadSettings } from "@/store/notes";

interface NotepadUnlockDialogProps {
  open: boolean;
  settings: NotepadSettings;
  onClose: () => void;
  onUnlock: () => void;
}

/** Unlocks the real notes with biometrics and/or a PIN, as chosen in notepad settings. */
const NotepadUnlockDialog = ({ open, settings, onClose, onUnlock }: NotepadUnlockDialogProps) => {
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesNotepadPin = settings.pinSource === "notepad" && hasNotepadPin();
  const pinAvailable = usesNotepadPin || isLockEnabled();
  const allowPin = settings.unlock !== "biometrics" || !hasBiometrics; // biometrics-only falls back to PIN when unavailable
  const allowBiometrics = settings.unlock !== "pin" && hasBiometrics;
  const numeric = usesNotepadPin || getAuthMode() === "pin";

  const tryBiometrics = async () => {
    setBusy(true);
    try {
      const result = await verifyWithBiometrics("Open notes");
      if (result === "ok") onUnlock();
      else if (result === "failed") setError("Not recognised. Try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setCredential("");
    setError(null);
    let cancelled = false;
    void biometricsAvailable().then((ok) => {
      if (cancelled) return;
      setHasBiometrics(ok);
      if (ok && settings.unlock !== "pin") void tryBiometrics();
    });
    return () => {
      cancelled = true;
    };
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const tryCredential = async () => {
    if (!credential) return;
    setBusy(true);
    try {
      // Sentry Mode works here too.
      if (hasPanicPin() && (await verifyPanicPin(credential))) {
        window.dispatchEvent(new CustomEvent("phantom:panic", { detail: credential }));
        return;
      }
      const ok = usesNotepadPin ? await verifyNotepadPin(credential) : await verifyPin(credential);
      if (ok) onUnlock();
      else {
        setCredential("");
        setError("Incorrect PIN.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>Locked notes</DialogTitle>
          <DialogDescription>Confirm it's you to open your notes.</DialogDescription>
        </DialogHeader>
        {!allowBiometrics && !(allowPin && pinAvailable) ? (
          <p className="text-sm text-muted-foreground">Turn on Screen Lock in Settings to set a PIN, then come back.</p>
        ) : (
          <div className="space-y-3">
            {allowBiometrics && (
              <Button className="w-full" variant="outline" disabled={busy} onClick={() => void tryBiometrics()}>
                <Fingerprint className="h-4 w-4 mr-2" /> Use fingerprint or face
              </Button>
            )}
            {allowPin && pinAvailable && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void tryCredential();
                }}
              >
                <Input
                  type="password"
                  inputMode={numeric ? "numeric" : "text"}
                  autoComplete="off"
                  placeholder={usesNotepadPin ? "Notes PIN" : numeric ? "PIN" : "Passphrase"}
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  autoFocus={!allowBiometrics}
                />
                <Button type="submit" disabled={busy || !credential}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open"}
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

export default NotepadUnlockDialog;
