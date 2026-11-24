import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleGroupHeaderProps {
  open: boolean;
  onToggle: () => void;
  /** The group or category heading. */
  children: ReactNode;
  /** Items in the group, shown after the heading so a collapsed group still says how much it holds. */
  count?: number;
  /** Extra content on the right, e.g. a group total. */
  aside?: ReactNode;
  className?: string;
}

/** Clickable heading for a group or category of items; the chevron turns when the group is open. */
export function CollapsibleGroupHeader({ open, onToggle, children, count, aside, className }: CollapsibleGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "text-sm flex w-full min-w-0 items-center gap-2 rounded-md text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} aria-hidden="true" />
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      {count !== undefined && <span className="shrink-0 text-xs font-normal normal-case tracking-normal text-muted-foreground">({count})</span>}
      {aside && <span className="ml-auto shrink-0">{aside}</span>}
    </button>
  );
}
