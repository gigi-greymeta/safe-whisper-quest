import { useState, useRef } from "react";
import { Send, Lock, Paperclip, X, Image, EyeOff, MapPin, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const MAX_FILE_SIZE = 500 * 1024; // 500KB

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendFile?: (file: { name: string; type: string; data: string }) => void;
  onTyping?: () => void;
  disabled?: boolean;
  /** Scrambled-message toggle; hidden when onToggleScramble isn't given. */
  scramble?: boolean;
  onToggleScramble?: () => void;
  /** Pin drop button; hidden when not given. */
  onDropPin?: () => void;
  /** Voice message button; hidden when not given. */
  onVoice?: () => void;
}

const ChatInput = ({ onSend, onSendFile, onTyping, disabled, scramble, onToggleScramble, onDropPin, onVoice }: ChatInputProps) => {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; type: string; data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleSend = () => {
    if (attachment && onSendFile) {
      onSendFile(attachment);
      setAttachment(null);
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value.length > 0) {
      onTyping?.();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File too large",
        description: `Max size is ${MAX_FILE_SIZE / 1024}KB for E2E encrypted transfer.`,
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setAttachment({ name: file.name, type: file.type, data: base64 });
    };
    reader.readAsDataURL(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="border-t bg-card/50 backdrop-blur-sm">
      {/* Attachment preview */}
      {attachment && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs">
            {attachment.type.startsWith("image/") ? (
              <Image className="h-3.5 w-3.5 text-primary" />
            ) : (
              <Paperclip className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="text-foreground truncate max-w-[160px]">{attachment.name}</span>
            <span className="text-muted-foreground">
              ({Math.round(attachment.data.length * 0.75 / 1024)}KB)
            </span>
            <button onClick={() => setAttachment(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 p-3">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Lock className="h-3 w-3" />
        </div>
        {onSendFile && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={handleFileSelect}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </>
        )}
        {onVoice && (
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onVoice} disabled={disabled} aria-label="Voice message" title="Voice message">
            <Mic className="h-4 w-4" />
          </Button>
        )}
        {onDropPin && (
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={onDropPin} disabled={disabled} aria-label="Drop a pin" title="Drop a pin">
            <MapPin className="h-4 w-4" />
          </Button>
        )}
        {onToggleScramble && (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-10 w-10 shrink-0", scramble && "text-primary bg-primary/10")}
            onClick={onToggleScramble}
            disabled={disabled}
            aria-pressed={!!scramble}
            aria-label={scramble ? "Scrambling on" : "Scrambling off"}
            title={scramble ? "Scrambling on: the recipient must unlock each message" : "Scramble messages"}
          >
            <EyeOff className="h-4 w-4" />
          </Button>
        )}
        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={attachment ? "Add a caption..." : scramble ? "Scrambled message..." : "Encrypted message..."}
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground caret-foreground leading-5",
            "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
            "min-h-[40px] max-h-[120px]"
          )}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !attachment)}
          className="rounded-full h-10 w-10 shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default ChatInput;
