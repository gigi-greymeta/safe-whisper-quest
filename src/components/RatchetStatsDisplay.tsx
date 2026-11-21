import { getStatsForContact } from "@/store/ratchetStats";
import { Shield, Key, RefreshCw, Trash2 } from "lucide-react";

interface RatchetStatsDisplayProps {
  contactId: string;
}

const RatchetStatsDisplay = ({ contactId }: RatchetStatsDisplayProps) => {
  const stats = getStatsForContact(contactId);

  const items = [
    {
      icon: RefreshCw,
      label: "DH ratchet rotations",
      value: stats.dhRatchetCount,
      color: "text-primary",
    },
    {
      icon: Key,
      label: "Unique send keys used",
      value: stats.messageKeysSent,
      color: "text-primary",
    },
    {
      icon: Key,
      label: "Unique recv keys used",
      value: stats.messageKeysReceived,
      color: "text-primary",
    },
    {
      icon: Trash2,
      label: "Old keys destroyed",
      value: stats.keysDestroyed,
      color: "text-emerald-400",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-2">
        <Shield className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold text-foreground">Forward Secrecy Stats</p>
      </div>
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <item.icon className={`h-3 w-3 ${item.color}`} />
            <span className="text-[11px] text-muted-foreground">{item.label}</span>
          </div>
          <span className="text-[11px] font-mono text-foreground">{item.value}</span>
        </div>
      ))}
      {stats.lastRatchetAt && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Last rotation: {new Date(stats.lastRatchetAt).toLocaleString()}
        </p>
      )}
      {stats.dhRatchetCount === 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Ratchet will rotate on first bidirectional message exchange.
        </p>
      )}
    </div>
  );
};

export default RatchetStatsDisplay;
