import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Timer } from "lucide-react";
import type { DisappearTimer } from "@/store/messages";

interface DisappearingTimerProps {
  value: DisappearTimer;
  onChange: (value: DisappearTimer) => void;
}

const timerOptions: { value: DisappearTimer; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "30s", label: "30 seconds" },
  { value: "5m", label: "5 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
];

const DisappearingTimerSelect = ({ value, onChange }: DisappearingTimerProps) => {
  return (
    <div className="flex items-center gap-2">
      <Timer className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as DisappearTimer)}>
        <SelectTrigger className="w-[140px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {timerOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default DisappearingTimerSelect;
