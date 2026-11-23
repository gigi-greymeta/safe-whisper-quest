import { useEffect, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCall } from "@/contexts/CallContext";
import { useCrypto } from "@/hooks/useCrypto";
import { useTier } from "@/hooks/useTier";
import { playSound } from "@/lib/notificationSound";
import { VOICE_FILTERS } from "@/lib/calls/voiceFilter";

const END_TEXT: Record<string, string> = {
  hangup: "Call ended",
  declined: "Call declined",
  busy: "On another call",
  timeout: "No answer",
  failed: "Call failed",
  mic: "Microphone unavailable",
};

const formatDuration = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Full-screen call UI, shown over the app whenever a call is active. */
const CallScreen = () => {
  const { call, accept, decline, hangUp, toggleMute, setFilter } = useCall();
  const { state } = useCrypto();
  const { has } = useTier();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (call.status !== "connected") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call.status]);

  // Ring while an incoming call waits.
  useEffect(() => {
    if (call.status !== "incoming") return;
    playSound("pulse", 0.8);
    const t = setInterval(() => playSound("pulse", 0.8), 2000);
    return () => clearInterval(t);
  }, [call.status]);

  if (call.status === "idle") return null;

  const contact = state.contacts.find((c) => c.id === call.contactId);
  const name = contact?.displayName ?? "Unknown";
  const status =
    call.status === "incoming"
      ? "Incoming call"
      : call.status === "outgoing"
        ? "Calling…"
        : call.status === "connecting"
          ? "Connecting…"
          : call.status === "connected" && call.connectedAt
            ? formatDuration(now - call.connectedAt)
            : END_TEXT[call.endReason ?? "hangup"];
  const live = call.status === "outgoing" || call.status === "connecting" || call.status === "connected";

  return (
    <div className="dark fixed inset-0 z-[150] flex flex-col bg-background text-foreground pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="h-24 w-24 rounded-full bg-primary/15 flex items-center justify-center text-3xl font-semibold text-primary">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <p className="text-2xl font-semibold">{name}</p>
        <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">{status}</p>
        <p className="text-[11px] text-muted-foreground">End-to-end encrypted</p>
      </div>

      {(live || call.status === "incoming") && has("voiceFilter") && (
        <div className="px-6 mb-8">
          <p className="text-xs text-muted-foreground text-center mb-2">Voice filter</p>
          <div className="flex justify-center gap-2">
            {VOICE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={call.filter === f.id}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm border",
                  call.filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-10">
        {call.status === "incoming" ? (
          <>
            <Button size="icon" className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90" onClick={decline} aria-label="Decline">
              <PhoneOff className="h-7 w-7" />
            </Button>
            <Button size="icon" className="h-16 w-16 rounded-full bg-emerald-600 hover:bg-emerald-600/90" onClick={() => void accept()} aria-label="Answer">
              <Phone className="h-7 w-7" />
            </Button>
          </>
        ) : live ? (
          <>
            <Button size="icon" variant="outline" className="h-14 w-14 rounded-full" onClick={toggleMute} aria-pressed={call.muted} aria-label={call.muted ? "Unmute" : "Mute"}>
              {call.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>
            <Button size="icon" className="h-16 w-16 rounded-full bg-destructive hover:bg-destructive/90" onClick={hangUp} aria-label="Hang up">
              <PhoneOff className="h-7 w-7" />
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default CallScreen;
