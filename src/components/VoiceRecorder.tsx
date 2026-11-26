import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Send, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { VOICE_FILTERS, type VoiceFilterId } from "@/lib/calls/voiceFilter";
import { formatDuration, MAX_VOICE_MS, startRecording, type Recording } from "@/lib/voiceMessage";

const FILTER_PREF_KEY = "phantom_voice_filter";

const savedFilter = (): VoiceFilterId => {
  try {
    const v = localStorage.getItem(FILTER_PREF_KEY);
    if (v === "deep" || v === "high" || v === "robot") return v;
  } catch {
    // Storage blocked: start unfiltered.
  }
  return "off";
};

interface VoiceRecorderProps {
  open: boolean;
  /** Largest recording this chat can carry. */
  maxBytes: number;
  /** Voice filter is Premium; without it the recording is the plain voice. */
  allowFilter: boolean;
  onClose: () => void;
  onSend: (blob: Blob, durationMs: number) => Promise<void> | void;
}

/**
 * Records a voice message through the voice filter. The filter can be changed while
 * recording; only the filtered audio is captured. Nothing is sent until "Send".
 */
const VoiceRecorder = ({ open, maxBytes, allowFilter, onClose, onSend }: VoiceRecorderProps) => {
  const [filter, setFilter] = useState<VoiceFilterId>(() => (allowFilter ? savedFilter() : "off"));
  const [phase, setPhase] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ blob: Blob; durationMs: number; url: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rec = useRef<Recording | null>(null);

  const reset = () => {
    if (rec.current?.recorder.state === "recording") rec.current.recorder.stop();
    rec.current = null;
    if (result) URL.revokeObjectURL(result.url);
    setResult(null);
    setPhase("idle");
    setElapsed(0);
    setNotice(null);
  };

  useEffect(() => {
    if (!open) reset();
    // Reset only when the dialog closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 250);
    return () => clearInterval(t);
  }, [phase]);

  const start = async () => {
    setNotice(null);
    try {
      const r = await startRecording(allowFilter ? filter : "off", maxBytes, () => setNotice("Reached the maximum length."));
      rec.current = r;
      setPhase("recording");
      void r.done.then(({ blob, durationMs }) => {
        setResult({ blob, durationMs, url: URL.createObjectURL(blob) });
        setPhase("review");
      });
    } catch {
      setNotice("Couldn't use the microphone. Check that Phantom is allowed to use it.");
    }
  };

  const chooseFilter = (id: VoiceFilterId) => {
    setFilter(id);
    rec.current?.mic.setFilter(id);
    try {
      localStorage.setItem(FILTER_PREF_KEY, id);
    } catch {
      // Storage blocked: the filter still applies to this recording.
    }
  };

  const send = async () => {
    if (!result) return;
    setPhase("sending");
    try {
      await onSend(result.blob, result.durationMs);
      onClose();
    } catch {
      setPhase("review");
      setNotice("Couldn't send. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="dark max-w-sm">
        <DialogHeader>
          <DialogTitle>Voice message</DialogTitle>
          <DialogDescription>
            {allowFilter
              ? "Choose a voice filter. Only the filtered voice is recorded and sent."
              : "Record an end-to-end encrypted voice message."}
          </DialogDescription>
        </DialogHeader>

        {allowFilter && (
        <div className="flex justify-center gap-2 flex-wrap">
          {VOICE_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={phase === "review" || phase === "sending"}
              onClick={() => chooseFilter(f.id)}
              aria-pressed={filter === f.id}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm border disabled:opacity-50",
                filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
        )}

        <div className="flex flex-col items-center gap-3 py-2">
          {phase === "review" || phase === "sending" ? (
            result && <audio src={result.url} controls className="w-full" />
          ) : (
            <p className={cn("text-3xl font-light tabular-nums", phase === "recording" ? "text-destructive" : "text-foreground")}>
              {formatDuration(elapsed)}
              <span className="text-xs text-muted-foreground"> / {formatDuration(MAX_VOICE_MS)}</span>
            </p>
          )}
          {notice && <p className="text-xs text-muted-foreground text-center">{notice}</p>}
        </div>

        <div className="flex items-center justify-center gap-6">
          {phase === "idle" && (
            <Button size="icon" className="h-16 w-16 rounded-full" aria-label="Start recording" onClick={() => void start()}>
              <Mic className="h-7 w-7" />
            </Button>
          )}
          {phase === "recording" && (
            <Button size="icon" className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90" aria-label="Stop recording" onClick={() => rec.current?.recorder.stop()}>
              <Square className="h-6 w-6" />
            </Button>
          )}
          {(phase === "review" || phase === "sending") && (
            <>
              <Button size="icon" variant="outline" className="h-12 w-12 rounded-full" aria-label="Discard" disabled={phase === "sending"} onClick={reset}>
                <Trash2 className="h-5 w-5" />
              </Button>
              <Button size="icon" className="h-16 w-16 rounded-full" aria-label="Send" disabled={phase === "sending"} onClick={() => void send()}>
                {phase === "sending" ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceRecorder;
