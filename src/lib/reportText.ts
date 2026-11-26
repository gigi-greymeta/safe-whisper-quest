// Turns a stored chat message into readable text for an abuse report.

import { parseScrambled } from "@/lib/scramble";
import { parsePinDrop, formatCoords } from "@/lib/location";
import { parseVoiceMessage } from "@/lib/voiceMessage";

export function readableForReport(text: string): string {
  const scrambled = parseScrambled(text);
  if (scrambled !== null) return scrambled;
  const pin = parsePinDrop(text);
  if (pin) return `[Pin drop: ${formatCoords(pin)}${pin.label ? ` "${pin.label}"` : ""}]`;
  if (parseVoiceMessage(text)) return "[Voice message]";
  try {
    const p = JSON.parse(text);
    if (p?.__type === "file_attachment") return `[Attachment: ${p.name ?? "file"}]${p.caption ? ` ${p.caption}` : ""}`;
  } catch {
    // Plain text.
  }
  return text;
}
