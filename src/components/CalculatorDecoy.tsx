import { useState } from "react";
import { cn } from "@/lib/utils";

interface CalculatorDecoyProps {
  /**
   * Called with the digits typed before "=". Return true if they unlocked the
   * app (or triggered a panic wipe); otherwise the calculator just shows the result.
   */
  onCode: (code: string) => Promise<boolean>;
}

type Op = "+" | "−" | "×" | "÷";

const apply = (a: number, b: number, op: Op): number =>
  op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : b === 0 ? NaN : a / b;

const format = (n: number): string => {
  if (!Number.isFinite(n)) return "Error";
  const s = String(Number(n.toPrecision(12)));
  return s.length > 12 ? n.toExponential(6) : s;
};

/**
 * Working calculator shown in place of the lock screen when the Calculator
 * disguise is on. Typing the app PIN and pressing "=" opens Phantom; the
 * Sentry Mode PIN wipes it. Anything else behaves like a normal calculator.
 */
const CalculatorDecoy = ({ onCode }: CalculatorDecoyProps) => {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true);
  // Every digit since the last operator or clear, to check against the PIN on "=".
  const [typed, setTyped] = useState("");

  const digit = (d: string) => {
    setTyped((t) => (t + d).slice(-32));
    if (fresh || display === "0") {
      setDisplay(d === "." ? "0." : d);
      setFresh(false);
    } else if (!(d === "." && display.includes(".")) && display.length < 12) {
      setDisplay(display + d);
    }
  };

  const clear = () => {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
    setTyped("");
  };

  const operator = (next: Op) => {
    const value = parseFloat(display);
    const result = acc !== null && op && !fresh ? apply(acc, value, op) : value;
    setAcc(result);
    setDisplay(format(result));
    setOp(next);
    setFresh(true);
    setTyped("");
  };

  const equals = async () => {
    const code = typed;
    setTyped("");
    if (op === null && code.length >= 4 && (await onCode(code))) return;
    if (acc !== null && op) {
      setDisplay(format(apply(acc, parseFloat(display), op)));
      setAcc(null);
      setOp(null);
    }
    setFresh(true);
  };

  const keys: { label: string; onPress: () => void; kind?: "op" | "fn"; wide?: boolean }[] = [
    { label: "AC", onPress: clear, kind: "fn" },
    { label: "±", onPress: () => setDisplay(format(-parseFloat(display))), kind: "fn" },
    { label: "%", onPress: () => setDisplay(format(parseFloat(display) / 100)), kind: "fn" },
    { label: "÷", onPress: () => operator("÷"), kind: "op" },
    ...["7", "8", "9"].map((d) => ({ label: d, onPress: () => digit(d) })),
    { label: "×", onPress: () => operator("×"), kind: "op" as const },
    ...["4", "5", "6"].map((d) => ({ label: d, onPress: () => digit(d) })),
    { label: "−", onPress: () => operator("−"), kind: "op" as const },
    ...["1", "2", "3"].map((d) => ({ label: d, onPress: () => digit(d) })),
    { label: "+", onPress: () => operator("+"), kind: "op" as const },
    { label: "0", onPress: () => digit("0"), wide: true },
    { label: ".", onPress: () => digit(".") },
    { label: "=", onPress: () => void equals(), kind: "op" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-950 text-white select-none pt-[env(safe-area-inset-top)] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 flex items-end justify-end px-6 pb-4">
        <p className="text-6xl font-light tabular-nums truncate" aria-live="polite">{display}</p>
      </div>
      <div className="grid grid-cols-4 gap-3 px-4 max-w-md w-full mx-auto">
        {keys.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={k.onPress}
            className={cn(
              "h-16 rounded-full text-2xl font-medium active:opacity-70 transition-opacity",
              k.wide && "col-span-2",
              k.kind === "op" ? "bg-teal-500 text-white" : k.kind === "fn" ? "bg-neutral-400 text-neutral-950" : "bg-neutral-800"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default CalculatorDecoy;
