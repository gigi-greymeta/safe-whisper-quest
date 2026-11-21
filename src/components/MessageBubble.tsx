import { cn } from "@/lib/utils";
import { Check, CheckCheck, ShieldCheck, ShieldAlert, Shield, Download, Cloud, CloudOff, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageBubbleProps {
  text: string;
  fromMe: boolean;
  timestamp: number;
  status?: string;
  disappearing?: boolean;
  hmacVerified?: boolean | null;
  /** True once the relay accepted the send (i.e. saveMessage succeeded). */
  deliveredToRelay?: boolean;
  /** True if the peer has acknowledged it (read receipt). */
  receivedByPeer?: boolean;
}

const MessageBubble = ({
  text,
  fromMe,
  timestamp,
  status = "sent",
  disappearing,
  hmacVerified,
  deliveredToRelay = true,
  receivedByPeer,
}: MessageBubbleProps) => {
  const time = new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const [imageExpanded, setImageExpanded] = useState(false);

  // Check if this is a file attachment message
  let fileAttachment: { name: string; type: string; data: string; caption?: string } | null = null;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.__type === "file_attachment") {
      fileAttachment = parsed;
    }
  } catch {
    // Not a file attachment
  }

  const handleDownload = () => {
    if (!fileAttachment) return;
    const byteString = atob(fileAttachment.data);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: fileAttachment.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileAttachment.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn("flex w-full mb-2", fromMe ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm",
          fromMe
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card border rounded-bl-md text-card-foreground"
        )}
      >
        {fileAttachment ? (
          <div className="space-y-1.5">
            {fileAttachment.type.startsWith("image/") ? (
              <button onClick={() => setImageExpanded(!imageExpanded)} className="block">
                <img
                  src={`data:${fileAttachment.type};base64,${fileAttachment.data}`}
                  alt={fileAttachment.name}
                  className={cn(
                    "rounded-lg object-cover",
                    imageExpanded ? "max-w-full" : "max-w-[200px] max-h-[200px]"
                  )}
                />
              </button>
            ) : (
              <button
                onClick={handleDownload}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2",
                  fromMe ? "border-primary-foreground/20" : "border-border"
                )}
              >
                <Download className="h-4 w-4 shrink-0" />
                <div className="min-w-0 text-left">
                  <p className="text-xs font-medium truncate">{fileAttachment.name}</p>
                  <p className="text-[10px] opacity-60">
                    {Math.round(fileAttachment.data.length * 0.75 / 1024)}KB · E2E encrypted
                  </p>
                </div>
              </button>
            )}
            {fileAttachment.caption && (
              <p className="text-sm leading-relaxed break-words">{fileAttachment.caption}</p>
            )}
          </div>
        ) : (
          <p className="text-sm leading-relaxed break-words">{text}</p>
        )}
        <div className={cn(
          "flex items-center gap-1 mt-1",
          fromMe ? "justify-end" : "justify-start"
        )}>
          {disappearing && (
            <span className="text-[10px] opacity-60">⏱</span>
          )}
          {/* HMAC verification indicator for received messages */}
          {!fromMe && hmacVerified === true && (
            <ShieldCheck className="h-2.5 w-2.5 text-emerald-400" />
          )}
          {!fromMe && hmacVerified === false && (
            <ShieldAlert className="h-2.5 w-2.5 text-destructive" />
          )}
          {!fromMe && hmacVerified == null && (
            <Shield className="h-2.5 w-2.5 opacity-30 text-muted-foreground" />
          )}
          <span className={cn(
            "text-[10px]",
            fromMe ? "text-primary-foreground/60" : "text-muted-foreground"
          )}>
            {time}
          </span>
          {fromMe && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-primary-foreground/60 inline-flex items-center gap-0.5 cursor-default">
                    {/* Step 1 — sent to relay */}
                    {deliveredToRelay ? (
                      <Cloud className="h-3 w-3" />
                    ) : (
                      <CloudOff className="h-3 w-3 text-destructive" />
                    )}
                    {/* Step 2 — peer ack (read receipt) */}
                    {(receivedByPeer ?? status === "read") ? (
                      <CheckCheck className="h-3 w-3" />
                    ) : status === "delivered" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Loader2 className="h-3 w-3 opacity-60" />
                    )}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px] leading-tight">
                  <div className="space-y-0.5">
                    <div>
                      Relay:{" "}
                      {deliveredToRelay ? "delivered" : "failed"}
                    </div>
                    <div>
                      Peer:{" "}
                      {(receivedByPeer ?? status === "read")
                        ? "received & decrypted"
                        : "awaiting receipt"}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
