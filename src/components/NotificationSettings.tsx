import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Play } from "lucide-react";
import {
  getNotificationPrefs,
  setNotificationPrefs,
  SOUND_OPTIONS,
  type SoundId,
} from "@/store/notificationPrefs";
import { playSound } from "@/lib/notificationSound";

const NotificationSettings = () => {
  const [prefs, setPrefs] = useState(getNotificationPrefs());

  const update = (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setNotificationPrefs(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="pr-3">
          <p className="text-sm text-foreground">Notification sound</p>
        </div>
        <Switch
          checked={prefs.enabled}
          onCheckedChange={(v) => update({ enabled: v })}
        />
      </div>

      {prefs.enabled && (
        <>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Sound</Label>
            <RadioGroup
              value={prefs.sound}
              onValueChange={(v) => update({ sound: v as SoundId })}
              className="space-y-1.5"
            >
              {SOUND_OPTIONS.map((opt) => (
                <div
                  key={opt.id}
                  className="flex items-center justify-between rounded-md border border-border/50 p-2.5"
                >
                  <div className="flex items-center gap-3">
                    <RadioGroupItem value={opt.id} id={`sound-${opt.id}`} />
                    <Label
                      htmlFor={`sound-${opt.id}`}
                      className="cursor-pointer"
                    >
                      <p className="text-sm text-foreground">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {opt.description}
                      </p>
                    </Label>
                  </div>
                  {opt.id !== "none" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary hover:text-primary"
                      onClick={() => playSound(opt.id, prefs.volume)}
                      aria-label={`Preview ${opt.label}`}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                Volume
              </Label>
              <span className="text-xs text-muted-foreground">
                {Math.round(prefs.volume * 100)}%
              </span>
            </div>
            <Slider
              value={[prefs.volume]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => update({ volume: v })}
              onValueCommit={([v]) => playSound(prefs.sound, v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="pr-3">
              <p className="text-sm text-foreground">Only when app is hidden</p>
            </div>
            <Switch
              checked={prefs.onlyWhenHidden}
              onCheckedChange={(v) => update({ onlyWhenHidden: v })}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationSettings;