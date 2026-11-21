import { CloudOff, Globe, Loader2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type RelayStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface RelayStatusIndicatorProps {
  status: RelayStatus;
  compact?: boolean;
  className?: string;
  pendingCount?: number;
  failedCount?: number;
  onRetry?: () => void;
}

const statusCopy: Record<RelayStatus, string> = {
  connected: "Relay connected",
  connecting: "Relay connecting",
  reconnecting: "Relay reconnecting",
  disconnected: "Relay disconnected",
};

export default function RelayStatusIndicator({ status, compact, className, pendingCount = 0, failedCount = 0, onRetry }: RelayStatusIndicatorProps) {
  const connected = status === "connected";
  const pending = status === "connecting" || status === "reconnecting";
  const Icon = connected ? Globe : pending ? Loader2 : CloudOff;

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium",
          connected && "border-primary/30 bg-primary/10 text-primary",
          pending && "border-muted bg-muted/40 text-muted-foreground",
          status === "disconnected" && "border-destructive/30 bg-destructive/10 text-destructive",
        )}
        title={statusCopy[status]}
      >
        <Icon className={cn("h-3 w-3", pending && "animate-spin")} />
        <span>{compact ? (connected ? "Relay" : statusCopy[status].replace("Relay ", "")) : statusCopy[status]}</span>
      </div>
      {pendingCount > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-muted bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          title={`${pendingCount} message${pendingCount === 1 ? "" : "s"} queued for retry`}
        >
          <Clock className="h-3 w-3" />
          {pendingCount} queued
        </span>
      )}
      {failedCount > 0 && (
        <button
          type="button"
          onClick={onRetry}
          disabled={!onRetry}
          className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive hover:bg-destructive/20 disabled:cursor-default"
          title={`${failedCount} message${failedCount === 1 ? "" : "s"} failed after ${10} retries — tap to retry`}
        >
          <AlertTriangle className="h-3 w-3" />
          {failedCount} failed{onRetry ? " · retry" : ""}
        </button>
      )}
    </div>
  );
}