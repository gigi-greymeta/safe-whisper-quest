import { useEffect, useState } from "react";
import { Crosshair, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCoords, getCurrentPin, parseCoordinates, type PinDrop } from "@/lib/location";

interface PinDropDialogProps {
  open: boolean;
  onClose: () => void;
  onSend: (pin: PinDrop) => void;
}

/** Pick a pin (where you are, or coordinates / a maps link you paste) and send it. */
const PinDropDialog = ({ open, onClose, onSend }: PinDropDialogProps) => {
  const [pin, setPin] = useState<PinDrop | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [pasted, setPasted] = useState("");

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      setPin(await getCurrentPin());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't get your location.");
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setPin(null);
    setLabel("");
    setPasted("");
    void locate();
  }, [open]);

  const applyPasted = () => {
    const coords = parseCoordinates(pasted);
    if (!coords) {
      setError("Couldn't find coordinates. Paste \"latitude, longitude\" or a Google or Apple Maps link.");
      return;
    }
    setError(null);
    setPin(coords);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>Drop a pin</DialogTitle>
          <DialogDescription>Location sharing is end-to-end encrypted.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border p-3 flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              {locating ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Finding your location…
                </p>
              ) : pin ? (
                <>
                  <p className="text-sm font-medium text-foreground tabular-nums">{formatCoords(pin)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {pin.accuracy !== undefined ? `Your location, accurate to about ${pin.accuracy} m` : "From the coordinates you entered"}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No location yet.</p>
              )}
            </div>
            <Button variant="ghost" size="icon" aria-label="Use my location" disabled={locating} onClick={() => void locate()}>
              <Crosshair className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Input placeholder="Or paste coordinates or a maps link" value={pasted} onChange={(e) => setPasted(e.target.value)} />
            <Button variant="outline" disabled={!pasted.trim()} onClick={applyPasted}>
              Use
            </Button>
          </div>

          <Input placeholder="Label (optional), e.g. Meet here" maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full"
            disabled={!pin}
            onClick={() => {
              if (!pin) return;
              onSend({ ...pin, label: label.trim() || undefined });
              onClose();
            }}
          >
            Send pin
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PinDropDialog;
