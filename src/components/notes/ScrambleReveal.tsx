import { useEffect, useRef, useState } from "react";
import type { Note } from "@/store/notes";
import { scrambleFrame } from "@/lib/scrambleText";

const DURATION_MS = 1400;

const preview = (n: Note) => n.body.split("\n").find((l) => l.trim()) ?? "No additional text";

interface ScrambleRevealProps {
  from: Note[];
  to: Note[];
  onDone: () => void;
}

interface Line {
  from: string;
  to: string;
}

/**
 * Plays the decoy list scrambling into the real notes, then hands over. Skipped for
 * people who've asked their device to reduce motion.
 */
const ScrambleReveal = ({ from, to, onDone }: ScrambleRevealProps) => {
  const rows = Math.max(from.length, to.length, 1);
  const lines = useRef<Line[][]>(
    Array.from({ length: rows }, (_, r) => [
      { from: from[r]?.title ?? "", to: to[r] ? to[r].title || "Untitled" : "" },
      { from: from[r] ? preview(from[r]) : "", to: to[r] ? preview(to[r]) : "" },
    ])
  );
  const seeds = useRef(Array.from({ length: 64 }, () => Math.random()));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION_MS);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setTimeout(onDone, 250);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Runs once per reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="dark flex flex-col h-screen bg-background">
      <div className="flex items-center gap-2 p-3 border-b pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="flex-1 text-xl font-semibold text-foreground px-1 font-mono">
          {scrambleFrame("Notes", "Private notes", progress, seeds.current)}
        </h1>
      </div>
      <ul className="flex-1 overflow-hidden divide-y divide-border" aria-hidden>
        {lines.current.map(([title, body], r) => (
          <li
            key={r}
            className="px-4 py-3 transition-opacity duration-500"
            style={{ opacity: !to[r] && progress > 0.7 ? 0 : 1 }}
          >
            <p className="text-sm font-medium text-foreground truncate font-mono">{scrambleFrame(title.from, title.to, progress, seeds.current)}</p>
            <p className="text-xs text-muted-foreground truncate font-mono">{scrambleFrame(body.from, body.to, progress, seeds.current)}</p>
          </li>
        ))}
      </ul>
      <span className="sr-only" role="status">Opening your notes</span>
    </div>
  );
};

export default ScrambleReveal;
