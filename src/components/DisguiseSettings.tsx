import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Drama, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTier } from "@/hooks/useTier";
import { useToast } from "@/hooks/use-toast";
import { getAuthMode, isLockEnabled } from "@/store/lock";
import { DISGUISES, disguiseSupported, getDisguise, setDisguise, type DisguiseId } from "@/lib/disguise";
import { Capacitor } from "@capacitor/core";

const ICON_BG: Record<DisguiseId, string> = {
  default: "bg-primary",
  calculator: "bg-gradient-to-b from-teal-500 to-teal-700",
  notes: "bg-gradient-to-b from-amber-300 to-amber-500",
  weather: "bg-gradient-to-b from-sky-300 to-sky-600",
};

const HOW_TO_OPEN: Record<DisguiseId, string> = {
  default: "",
  calculator: "Type your PIN and press = to get in.",
  notes: "Add a note titled with your PIN to get in.",
  weather: "Press and hold the temperature for 2 seconds, then enter your PIN.",
};

/**
 * Premium: choose how the app appears on the home screen. A disguise that's already
 * on stays on after a downgrade (switching back to Phantom is always allowed), so the
 * icon never changes on its own in front of someone.
 */
const DisguiseSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { has } = useTier();
  const [current, setCurrent] = useState<DisguiseId>("default");
  const [busy, setBusy] = useState<DisguiseId | null>(null);
  const isIOS = Capacitor.getPlatform() === "ios";

  useEffect(() => {
    void getDisguise().then(setCurrent);
  }, []);

  if (!disguiseSupported()) return null;

  const choose = async (id: DisguiseId) => {
    if (id === current) return;
    if (id !== "default" && !has("appDisguise")) {
      navigate("/upgrade");
      return;
    }
    if (id === "calculator" && (!isLockEnabled() || getAuthMode() !== "pin")) {
      toast({
        title: "Set a PIN first",
        description: "The calculator opens Phantom when you type your PIN and press =. Turn on Screen Lock with a PIN above.",
      });
      return;
    }
    if (id === "weather" && !isLockEnabled()) {
      toast({
        title: "Set a PIN first",
        description: "The weather screen opens Phantom when you press and hold the temperature, then enter your PIN. Turn on Screen Lock above.",
      });
      return;
    }
    setBusy(id);
    try {
      await setDisguise(id);
      setCurrent(id);
      window.dispatchEvent(new CustomEvent("phantom:disguise", { detail: id }));
    } catch (e) {
      toast({ title: "Couldn't change the icon", description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Drama className="h-4 w-4 text-primary" /> App Disguise
          {!has("appDisguise") && <span className="text-[10px] uppercase tracking-wider text-primary">Premium</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-4 gap-2">
          {DISGUISES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => void choose(d.id)}
              disabled={!!busy}
              aria-pressed={current === d.id}
              className="flex flex-col items-center gap-1.5 rounded-lg p-2 hover:bg-muted/50 disabled:opacity-60"
            >
              <span className={cn("relative h-12 w-12 rounded-xl flex items-center justify-center", ICON_BG[d.id], current === d.id && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
                {busy === d.id ? (
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                ) : current === d.id ? (
                  <Check className="h-5 w-5 text-white" />
                ) : null}
              </span>
              <span className="text-[11px] text-foreground">{d.name}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Changes the home-screen icon{isIOS ? "" : " and name"}. {HOW_TO_OPEN[current]}
        </p>
      </CardContent>
    </Card>
  );
};

export default DisguiseSettings;
