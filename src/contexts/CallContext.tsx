// Voice calls between contacts (Premium to start a call; anyone can answer).
//
// Calls only ring while the app is open: there is no push service, so a closed
// app can't be woken for an incoming call.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCrypto } from "@/hooks/useCrypto";
import { getTier } from "@/hooks/useTier";
import { hasFeature } from "@/lib/subscription";
import { createPeerConnection, waitForIceGathering } from "@/lib/calls/rtc";
import { openFilteredMic, type FilteredMic, type VoiceFilterId } from "@/lib/calls/voiceFilter";
import type { CallSignal } from "@/contexts/cryptoTypes";

/** Ignore setup messages older than this (e.g. replayed from the relay after being offline). */
const SIGNAL_MAX_AGE_MS = 60_000;
/** Stop ringing if nobody answers. */
const RING_TIMEOUT_MS = 45_000;
const FILTER_PREF_KEY = "phantom_voice_filter";

export type CallStatus = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "ended";

export interface CallState {
  status: CallStatus;
  contactId: string | null;
  /** When the call connected, for the timer. */
  connectedAt: number | null;
  muted: boolean;
  filter: VoiceFilterId;
  /** Shown briefly after a call ends. */
  endReason: CallSignal["reason"] | "mic" | null;
}

interface CallContextValue {
  call: CallState;
  startCall: (contactId: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  setFilter: (id: VoiceFilterId) => void;
}

const IDLE: CallState = { status: "idle", contactId: null, connectedAt: null, muted: false, filter: "off", endReason: null };

const CallContext = createContext<CallContextValue | null>(null);

const savedFilter = (): VoiceFilterId => {
  try {
    const v = localStorage.getItem(FILTER_PREF_KEY);
    if (v === "deep" || v === "high" || v === "robot") return v;
  } catch {
    // Storage blocked: start unfiltered.
  }
  return "off";
};

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { sendCallSignal, onCallSignal } = useCrypto();
  const [call, setCall] = useState<CallState>(IDLE);
  const callRef = useRef(call);
  callRef.current = call;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const micRef = useRef<FilteredMic | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<string | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const teardown = useCallback((endReason: CallState["endReason"]) => {
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    ringTimerRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    micRef.current?.close();
    micRef.current = null;
    callIdRef.current = null;
    pendingOfferRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setCall((c) => ({ ...c, status: "ended", endReason }));
    setTimeout(() => setCall((c) => (c.status === "ended" ? IDLE : c)), 2000);
  }, []);

  const signal = useCallback(
    (contactId: string, s: Omit<CallSignal, "__type" | "ts" | "callId">) => {
      if (!callIdRef.current) return;
      void sendCallSignal(contactId, { ...s, callId: callIdRef.current, ts: Date.now() }).catch((e) =>
        console.error("[call] signal failed", e)
      );
    },
    [sendCallSignal]
  );

  /** Set up the connection with the (filtered) mic attached. */
  const preparePeer = useCallback(
    async (contactId: string, filter: VoiceFilterId) => {
      // Filters are Premium; anyone else sends their normal voice.
      const mic = await openFilteredMic(hasFeature(getTier(), "voiceFilter") ? filter : "off");
      micRef.current = mic;
      const pc = createPeerConnection();
      pcRef.current = pc;
      mic.stream.getTracks().forEach((t) => pc.addTrack(t, mic.stream));
      pc.ontrack = (e) => {
        if (!audioRef.current) {
          audioRef.current = new Audio();
          audioRef.current.autoplay = true;
        }
        audioRef.current.srcObject = e.streams[0];
        void audioRef.current.play().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCall((c) => (c.status === "connected" ? c : { ...c, status: "connected", connectedAt: Date.now() }));
        } else if (pc.connectionState === "failed") {
          signal(contactId, { kind: "end", reason: "failed" });
          teardown("failed");
        }
      };
      return pc;
    },
    [signal, teardown]
  );

  const startCall = useCallback(
    async (contactId: string) => {
      if (callRef.current.status !== "idle" && callRef.current.status !== "ended") return;
      if (!hasFeature(getTier(), "calls")) return;
      const filter = savedFilter();
      callIdRef.current = crypto.randomUUID();
      setCall({ ...IDLE, status: "outgoing", contactId, filter });
      try {
        const pc = await preparePeer(contactId, filter);
        await pc.setLocalDescription(await pc.createOffer());
        await waitForIceGathering(pc);
        if (!pcRef.current) return; // hung up while gathering
        signal(contactId, { kind: "offer", sdp: pc.localDescription?.sdp });
        ringTimerRef.current = setTimeout(() => {
          signal(contactId, { kind: "end", reason: "timeout" });
          teardown("timeout");
        }, RING_TIMEOUT_MS);
      } catch (e) {
        console.error("[call] start failed", e);
        teardown("mic");
      }
    },
    [preparePeer, signal, teardown]
  );

  const accept = useCallback(async () => {
    const { contactId, filter } = callRef.current;
    const offer = pendingOfferRef.current;
    if (callRef.current.status !== "incoming" || !contactId || !offer) return;
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
    setCall((c) => ({ ...c, status: "connecting" }));
    try {
      const pc = await preparePeer(contactId, filter);
      await pc.setRemoteDescription({ type: "offer", sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
      await waitForIceGathering(pc);
      if (!pcRef.current) return;
      signal(contactId, { kind: "answer", sdp: pc.localDescription?.sdp });
    } catch (e) {
      console.error("[call] accept failed", e);
      signal(contactId, { kind: "end", reason: "failed" });
      teardown("mic");
    }
  }, [preparePeer, signal, teardown]);

  const decline = useCallback(() => {
    const { contactId } = callRef.current;
    if (contactId) signal(contactId, { kind: "end", reason: "declined" });
    teardown("declined");
  }, [signal, teardown]);

  const hangUp = useCallback(() => {
    const { contactId } = callRef.current;
    if (contactId) signal(contactId, { kind: "end", reason: "hangup" });
    teardown("hangup");
  }, [signal, teardown]);

  const toggleMute = useCallback(() => {
    setCall((c) => {
      micRef.current?.setMuted(!c.muted);
      return { ...c, muted: !c.muted };
    });
  }, []);

  const setFilter = useCallback((id: VoiceFilterId) => {
    if (!hasFeature(getTier(), "voiceFilter")) return;
    micRef.current?.setFilter(id);
    try {
      localStorage.setItem(FILTER_PREF_KEY, id);
    } catch {
      // Storage blocked: the filter still applies to this call.
    }
    setCall((c) => ({ ...c, filter: id }));
  }, []);

  useEffect(() => {
    return onCallSignal((contactId, s) => {
      if (Date.now() - s.ts > SIGNAL_MAX_AGE_MS) return;
      const current = callRef.current;

      if (s.kind === "offer") {
        if (current.status !== "idle" && current.status !== "ended") {
          // Already on a call: tell the caller we're busy, without touching our own call.
          void sendCallSignal(contactId, { kind: "end", reason: "busy", callId: s.callId, ts: Date.now() });
          return;
        }
        callIdRef.current = s.callId;
        pendingOfferRef.current = s.sdp ?? null;
        setCall({ ...IDLE, status: "incoming", contactId, filter: savedFilter() });
        ringTimerRef.current = setTimeout(() => teardown("timeout"), RING_TIMEOUT_MS);
        return;
      }

      // Answers and hang-ups only apply to the call they belong to.
      if (s.callId !== callIdRef.current || contactId !== current.contactId) return;

      if (s.kind === "answer" && current.status === "outgoing" && s.sdp) {
        if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
        setCall((c) => ({ ...c, status: "connecting" }));
        void pcRef.current?.setRemoteDescription({ type: "answer", sdp: s.sdp }).catch((e) => {
          console.error("[call] bad answer", e);
          teardown("failed");
        });
      } else if (s.kind === "end") {
        teardown(s.reason ?? "hangup");
      }
    });
  }, [onCallSignal, sendCallSignal, teardown]);

  return (
    <CallContext.Provider value={{ call, startCall, accept, decline, hangUp, toggleMute, setFilter }}>
      {children}
    </CallContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCall(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be used inside CallProvider");
  return ctx;
}
