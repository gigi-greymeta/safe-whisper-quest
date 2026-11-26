import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getPushPrefs, pushSupported, requestPushPermission, savePushPrefs, type PushPrefs } from "@/lib/push";

/** Alerts while Phantom is closed. Off until turned on here; the permission prompt comes then. */
const PushSettings = () => {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<PushPrefs>(getPushPrefs);

  if (!pushSupported()) return null;

  const update = (next: PushPrefs) => {
    setPrefs(next);
    savePushPrefs(next);
    window.dispatchEvent(new Event("phantom:push-prefs"));
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-foreground">Alerts when Phantom is closed</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Shows "New message" when something arrives. Alerts never include who it's from or what it says, and Apple and Google see only that an alert was sent.
          </p>
        </div>
        <Switch
          checked={prefs.enabled}
          onCheckedChange={async (on) => {
            if (on && !(await requestPushPermission())) {
              toast({ title: "Notifications are off for Phantom", description: "Allow them in your phone's Settings, then try again." });
              return;
            }
            update({ ...prefs, enabled: on });
          }}
        />
      </div>

      {prefs.enabled && (
        <div className="space-y-2">
          <p className="text-sm text-foreground">While the app is disguised</p>
          <RadioGroup value={prefs.whileDisguised} onValueChange={(v) => update({ ...prefs, whileDisguised: v as PushPrefs["whileDisguised"] })}>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="off" id="push-disguise-off" className="mt-0.5" />
              <Label htmlFor="push-disguise-off" className="text-sm font-normal leading-snug">
                No alerts <span className="block text-[11px] text-muted-foreground">Safest: nothing appears until you open the app.</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="disguise" id="push-disguise-on" className="mt-0.5" />
              <Label htmlFor="push-disguise-on" className="text-sm font-normal leading-snug">
                Disguise-style alerts
                <span className="block text-[11px] text-muted-foreground">
                  E.g. "Calculator: You have a new reminder". Your phone still shows the real app name, Phantom, at the top of each alert.
                </span>
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}
    </div>
  );
};

export default PushSettings;
