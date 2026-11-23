// Voice messages (Standard to send, anyone can play). Premium users can record
// through the same voice filter as calls, so only the filtered voice is ever
// recorded or sent.
// In chats they travel as an end-to-end encrypted message envelope; in vanishing
// groups they go up as an encrypted media file like photos and videos.

import { openFilteredMic, type FilteredMic, type VoiceFilterId } from "@/lib/calls/voiceFilter";

/** Fits under the relay's 512 KB cap once base64-encoded and encrypted. */
export const MAX_CHAT_VOICE_BYTES = 230 * 1024;
export const MAX_VOICE_MS = 2 * 60 * 1000;

export interface VoiceMessage {
  mime: string;
  /** base64 audio */
  data: string;
  durationMs: number;
}

export function wrapVoiceMessage(v: VoiceMessage): string {
  return JSON.stringify({ __type: "voice_message", ...v });
}

export function parseVoiceMessage(text: string): VoiceMessage | null {
  if (!text.startsWith("{")) return null;
  try {
    const p = JSON.parse(text);
    if (p?.__type !== "voice_message" || typeof p.data !== "string" || typeof p.mime !== "string" || !p.mime.startsWith("audio/")) return null;
    return { mime: p.mime, data: p.data, durationMs: Number(p.durationMs) || 0 };
  } catch {
    return null;
  }
}

/** First recording format this WebView supports (Opus on Android, AAC/MP4 on iOS). */
export function pickRecordingMime(): string {
  const options = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface Recording {
  mic: FilteredMic;
  recorder: MediaRecorder;
  /** Resolves with the finished recording when stopped. */
  done: Promise<{ blob: Blob; durationMs: number }>;
}

/**
 * Start recording the filtered microphone. Stops by itself at the time limit or
 * when the recording reaches `maxBytes`.
 */
export async function startRecording(filter: VoiceFilterId, maxBytes: number, onLimit: () => void): Promise<Recording> {
  const mic = await openFilteredMic(filter);
  const mime = pickRecordingMime();
  const recorder = new MediaRecorder(mic.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
  const chunks: Blob[] = [];
  let bytes = 0;
  const started = Date.now();
  const limitTimer = setTimeout(() => {
    if (recorder.state === "recording") {
      recorder.stop();
      onLimit();
    }
  }, MAX_VOICE_MS);

  const done = new Promise<{ blob: Blob; durationMs: number }>((resolve) => {
    recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      chunks.push(e.data);
      bytes += e.data.size;
      // Leave headroom for the last chunk.
      if (bytes > maxBytes * 0.92 && recorder.state === "recording") {
        recorder.stop();
        onLimit();
      }
    };
    recorder.onstop = () => {
      clearTimeout(limitTimer);
      mic.close();
      resolve({ blob: new Blob(chunks, { type: recorder.mimeType || mime || "audio/webm" }), durationMs: Date.now() - started });
    };
  });

  recorder.start(1000);
  return { mic, recorder, done };
}
