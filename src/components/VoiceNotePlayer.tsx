import { useEffect, useState } from "react";
import { Mic } from "lucide-react";
import { formatDuration, type VoiceMessage } from "@/lib/voiceMessage";

/** Plays a voice message from memory; the audio is never written to the device. */
const VoiceNotePlayer = ({ voice }: { voice: VoiceMessage }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bytes = Uint8Array.from(atob(voice.data), (c) => c.charCodeAt(0));
    const u = URL.createObjectURL(new Blob([bytes], { type: voice.mime }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [voice.data, voice.mime]);

  return (
    <div className="flex items-center gap-2 min-w-[220px]">
      <Mic className="h-4 w-4 shrink-0 opacity-70" />
      {url && <audio src={url} controls preload="metadata" className="h-9 flex-1 min-w-0" />}
      {voice.durationMs > 0 && <span className="text-[10px] opacity-60 tabular-nums">{formatDuration(voice.durationMs)}</span>}
    </div>
  );
};

export default VoiceNotePlayer;
