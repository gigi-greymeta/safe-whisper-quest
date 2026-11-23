// Character-by-character scramble used to reveal the real notes behind the decoy list.

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&@$*+=?/<>";

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/**
 * Text that scrambles from one string into another. Each character first churns
 * through random glyphs, then settles on its target, sweeping left to right with a
 * little jitter. `progress` runs 0 → 1.
 */
export function scrambleFrame(from: string, to: string, progress: number, seeds: number[]): string {
  const len = Math.max(from.length, to.length);
  let out = "";
  for (let i = 0; i < len; i++) {
    const settleAt = 0.25 + (i / Math.max(len, 1)) * 0.6 + seeds[i % seeds.length] * 0.15;
    const startAt = Math.max(0, settleAt - 0.3);
    if (progress >= settleAt) out += to[i] ?? "";
    else if (progress > startAt) out += (to[i] ?? from[i]) === " " ? " " : glyph();
    else out += from[i] ?? "";
  }
  return out;
}
