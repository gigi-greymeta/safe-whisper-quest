import { KeyRound, ShieldAlert, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getRatchetState } from "@/store/ratchetState";

export type PfsStatus = "active" | "pending" | "legacy";

export function getPfsStatus(contactId: string): PfsStatus {
  const state = getRatchetState(contactId);
  if (!state) return "legacy";
  if (state.sendChainKey && state.recvChainKey) return "active";
  return "pending";
}

const config: Record<PfsStatus, { label: string; icon: typeof KeyRound; className: string }> = {
  active: { label: "PFS Active", icon: KeyRound, className: "text-emerald-600 dark:text-emerald-400" },
  pending: { label: "PFS Pending", icon: ShieldAlert, className: "text-amber-600 dark:text-amber-300" },
  legacy: { label: "Legacy", icon: Lock, className: "text-muted-foreground" },
};

const PfsIndicator = ({ contactId }: { contactId: string }) => {
  const status = getPfsStatus(contactId);
  const { label, icon: Icon, className } = config[status];

  return (
    <div className={cn("flex items-center gap-1 text-[10px]", className)}>
      <Icon className="h-2.5 w-2.5" />
      <span>{label}</span>
    </div>
  );
};

export default PfsIndicator;
