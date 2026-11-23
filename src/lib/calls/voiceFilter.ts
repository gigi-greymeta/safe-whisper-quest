// Voice filter for calls (Premium). The microphone runs through an AudioWorklet
// and only the processed audio is sent, so the other person never receives the
// real voice. A pitch shift is a disguise, not anonymisation: a determined
// listener with recordings and the right tools may partly reverse it.

import workletUrl from "./voice-filter.worklet.js?url";

export type VoiceFilterId = "off" | "deep" | "high" | "robot";

export const VOICE_FILTERS: { id: VoiceFilterId; name: string; ratio: number; ringHz: number }[] = [
  { id: "off", name: "Off", ratio: 1, ringHz: 0 },
  { id: "deep", name: "Deep", ratio: 0.72, ringHz: 0 },
  { id: "high", name: "High", ratio: 1.4, ringHz: 0 },
  { id: "robot", name: "Robot", ratio: 0.88, ringHz: 45 },
];

export interface FilteredMic {
  /** Stream to send: the processed voice only. */
  stream: MediaStream;
  setFilter: (id: VoiceFilterId) => void;
  setMuted: (muted: boolean) => void;
  close: () => void;
}

export async function openFilteredMic(filter: VoiceFilterId): Promise<FilteredMic> {
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false,
  });
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(workletUrl);
  const source = ctx.createMediaStreamSource(mic);
  const node = new AudioWorkletNode(ctx, "voice-filter", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
  const gain = ctx.createGain();
  const out = ctx.createMediaStreamDestination();
  source.connect(node).connect(gain).connect(out);

  const setFilter = (id: VoiceFilterId) => {
    const f = VOICE_FILTERS.find((v) => v.id === id) ?? VOICE_FILTERS[0];
    node.port.postMessage({ ratio: f.ratio, ringHz: f.ringHz });
  };
  setFilter(filter);
  if (ctx.state === "suspended") await ctx.resume();

  return {
    stream: out.stream,
    setFilter,
    setMuted: (muted) => {
      gain.gain.value = muted ? 0 : 1;
    },
    close: () => {
      mic.getTracks().forEach((t) => t.stop());
      out.stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
