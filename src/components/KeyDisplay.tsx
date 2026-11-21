import { cn } from "@/lib/utils";

interface KeyDisplayProps {
  fingerprint: string;
  label?: string;
  compact?: boolean;
}

const KeyDisplay = ({ fingerprint, label = "Public Key", compact = false }: KeyDisplayProps) => {
  const truncated = compact
    ? `${fingerprint.slice(0, 8)}...${fingerprint.slice(-8)}`
    : fingerprint;

  const handleCopy = () => {
    navigator.clipboard.writeText(fingerprint);
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <button
        onClick={handleCopy}
        className={cn(
          "font-mono text-xs break-all rounded-lg px-3 py-2 bg-muted/50 border",
          "hover:bg-muted transition-colors cursor-pointer text-left w-full",
          "text-foreground/80"
        )}
        title="Click to copy"
      >
        {truncated}
      </button>
    </div>
  );
};

export default KeyDisplay;
