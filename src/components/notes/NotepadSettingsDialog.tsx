import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasNotepadPin, removeNotepadPin, setNotepadPin } from "@/store/lock";
import type { NotepadSettings } from "@/store/notes";

interface NotepadSettingsDialogProps {
  open: boolean;
  settings: NotepadSettings;
  /** The decoy list is Premium. */
  decoyAllowed: boolean;
  onDecoyBlocked: () => void;
  /** Replace the decoy list with a new random set. */
  onShuffleDecoys: () => void;
  onClose: () => void;
  onChange: (settings: NotepadSettings) => void;
}

const UNLOCK_OPTIONS: { value: NotepadSettings["unlock"]; label: string }[] = [
  { value: "any", label: "Fingerprint, face or PIN" },
  { value: "biometrics", label: "Fingerprint or face only" },
  { value: "pin", label: "PIN only" },
];

const NotepadSettingsDialog = ({ open, settings, decoyAllowed, onDecoyBlocked, onShuffleDecoys, onClose, onChange }: NotepadSettingsDialogProps) => {
  const [pin, setPinValue] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const saveNotepadPin = async () => {
    if (!/^\d{4,12}$/.test(pin)) {
      setPinMessage("Use 4 to 12 digits.");
      return;
    }
    if (pin !== confirm) {
      setPinMessage("The PINs don't match.");
      return;
    }
    setSaving(true);
    try {
      await setNotepadPin(pin);
      onChange({ ...settings, pinSource: "notepad" });
      setPinValue("");
      setConfirm("");
      setPinMessage("Notes PIN saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Unlock with</p>
            <RadioGroup value={settings.unlock} onValueChange={(v) => onChange({ ...settings, unlock: v as NotepadSettings["unlock"] })}>
              {UNLOCK_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`unlock-${o.value}`} />
                  <Label htmlFor={`unlock-${o.value}`} className="text-sm font-normal">{o.label}</Label>
                </div>
              ))}
            </RadioGroup>
            {settings.unlock === "biometrics" && (
              <p className="text-[11px] text-muted-foreground">On devices without fingerprint or face unlock, the PIN is used instead.</p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">PIN</p>
            <RadioGroup value={settings.pinSource} onValueChange={(v) => onChange({ ...settings, pinSource: v as NotepadSettings["pinSource"] })}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="app" id="pin-app" />
                <Label htmlFor="pin-app" className="text-sm font-normal">Same as my app PIN</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="notepad" id="pin-notepad" disabled={!hasNotepadPin()} />
                <Label htmlFor="pin-notepad" className="text-sm font-normal">
                  A separate notes PIN{!hasNotepadPin() && " (set one below)"}
                </Label>
              </div>
            </RadioGroup>
            <div className="flex gap-2">
              <Input type="password" inputMode="numeric" placeholder="New notes PIN" value={pin} onChange={(e) => setPinValue(e.target.value)} />
              <Input type="password" inputMode="numeric" placeholder="Repeat" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={saving || !pin} onClick={() => void saveNotepadPin()}>
                {hasNotepadPin() ? "Change notes PIN" : "Set notes PIN"}
              </Button>
              {hasNotepadPin() && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    removeNotepadPin();
                    onChange({ ...settings, pinSource: "app" });
                    setPinMessage("Notes PIN removed. Your app PIN opens notes.");
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
            {pinMessage && <p className="text-[11px] text-muted-foreground">{pinMessage}</p>}
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Decoy notes list
                {!decoyAllowed && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">Premium</span>}
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                 Add a new note with your PIN as its title to retrieve notes.
              </p>
            </div>
            <Switch
              checked={settings.decoy && decoyAllowed}
              onCheckedChange={(decoy) => (decoy && !decoyAllowed ? onDecoyBlocked() : onChange({ ...settings, decoy }))}
            />
          </div>
          {settings.decoy && decoyAllowed && (
            <Button size="sm" variant="outline" onClick={onShuffleDecoys}>
              Shuffle decoy notes
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NotepadSettingsDialog;
