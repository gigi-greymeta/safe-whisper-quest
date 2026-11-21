import { useEffect, useState } from "react";
import { Shield, Smartphone, Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEEN_KEY = "phantom_first_run_seen_at";

interface Slide {
  icon: typeof Shield;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: Shield,
    title: "Zero-knowledge by design",
    body: "Your identity and messages are encrypted on this device. No accounts, no servers reading your data, no recovery emails — only you hold the keys.",
  },
  {
    icon: Smartphone,
    title: "Install Phantom as an app",
    body: "From a normal (non-incognito) browser window, add Phantom to your home screen. The installed app runs in its own private sandbox — more isolated than a private tab, and persistent.",
  },
  {
    icon: Download,
    title: "Back up your vault",
    body: "Identities are device-bound — they don't sync. Open Settings → Vault Export to save an encrypted backup you can restore on another device or browser.",
  },
];

/**
 * One-time onboarding shown on the very first landing-page visit. After the
 * user finishes (or skips), we persist a timestamp in localStorage so the
 * landing page stays clean on every subsequent visit.
 */
export default function FirstRunIntro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Lock background scroll while the intro is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const finish = () => {
    try {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
    } catch {}
    onDone();
  };

  const next = () => {
    if (step < SLIDES.length - 1) setStep(step + 1);
    else finish();
  };

  const slide = SLIDES[step];
  const Icon = slide.icon;
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex justify-end p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={finish}
          className="text-muted-foreground"
        >
          Skip
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="rounded-2xl bg-primary/10 p-5 text-primary mb-6">
          <Icon className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-3">
          {slide.title}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
          {slide.body}
        </p>
      </div>

      <div className="px-8 pb-10 space-y-5">
        <div className="flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <Button onClick={next} size="lg" className="w-full">
          {isLast ? "Get started" : "Next"}
        </Button>
      </div>
    </div>
  );
}

export function hasSeenFirstRun(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

export function resetFirstRunIntro(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {}
}

export function FirstRunIntroResetButton({ onReset }: { onReset?: () => void }) {
  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={() => {
        resetFirstRunIntro();
        onReset?.();
      }}
    >
      <RotateCcw className="h-4 w-4 mr-2" /> Show First-Run Guide
    </Button>
  );
}