import { cn } from "@/lib/utils";
import { User, ChevronRight, BadgeCheck, AlertTriangle } from "lucide-react";
import { checkPinnedKey } from "@/store/keyPinning";
import type { Contact } from "@/store/contacts";

interface ContactCardProps {
  contact: Contact;
  onClick: () => void;
  lastMessage?: string;
}

const ContactCard = ({ contact, onClick, lastMessage }: ContactCardProps) => {
  const pinStatus = checkPinnedKey(contact.publicKeyFingerprint, contact.publicKey);
  const keyMismatch = pinStatus === "mismatch";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full rounded-xl p-3",
        "hover:bg-accent/50 transition-colors text-left",
        keyMismatch && "ring-1 ring-destructive/40 bg-destructive/5"
      )}
    >
      <div className="relative">
        <div className={cn(
          "h-12 w-12 rounded-full flex items-center justify-center",
          keyMismatch ? "bg-destructive/10" : "bg-primary/10"
        )}>
          {keyMismatch ? (
            <AlertTriangle className="h-5 w-5 text-destructive" />
          ) : (
            <User className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background",
          contact.isOnline ? "bg-primary" : "bg-muted-foreground/30"
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="font-medium text-sm text-foreground truncate">{contact.displayName}</p>
          {contact.verified && !keyMismatch && (
            <BadgeCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
          {keyMismatch && (
            <span className="text-[9px] font-semibold text-destructive uppercase tracking-wider shrink-0">Key changed</span>
          )}
        </div>
        <p className={cn(
          "text-xs truncate",
          keyMismatch ? "text-destructive/70" : "text-muted-foreground"
        )}>
          {keyMismatch
            ? "⚠ Identity key mismatch — verify contact"
            : lastMessage || `Key: ${contact.publicKeyFingerprint.slice(0, 12)}...`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
};

export default ContactCard;
