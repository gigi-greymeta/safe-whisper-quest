import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleCardProps {
  title: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  contentClassName?: string;
}

/** A settings card whose body folds away behind its title. Collapsed by default. */
const CollapsibleCard = ({ title, icon, children, defaultOpen = false, contentClassName }: CollapsibleCardProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className={cn("cursor-pointer select-none", open ? "pb-3" : "pb-6")}>
            <CardTitle className="text-sm flex items-center gap-2">
              {icon} {title}
              <ChevronDown
                className={cn("h-4 w-4 ml-auto text-muted-foreground transition-transform duration-200", open && "rotate-180")}
                aria-hidden
              />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className={contentClassName}>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

/** A collapsible sub-section inside a card, styled like the existing bordered panels. */
export const CollapsibleSection = ({ title, icon, children, defaultOpen = false }: Omit<CollapsibleCardProps, "contentClassName">) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/60 bg-muted/30">
      <CollapsibleTrigger className="w-full flex items-center gap-2 p-3 text-left">
        {icon}
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
};

export default CollapsibleCard;
