import { describe, it, expect, beforeAll } from "vitest";

// Run the AudioWorklet's processor directly with a stub worklet scope.
type Processor = {
  port: { onmessage: (e: { data: unknown }) => void };
  process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean;
};
let Ctor: new () => Processor;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.sampleRate = 48000;
  g.AudioWorkletProcessor = class {
    port = { onmessage: (_: unknown) => {} };
  };
  g.registerProcessor = (_: string, c: new () => Processor) => {
    Ctor = c;
  };
  await import("@/lib/calls/voice-filter.worklet.js");
});

/** Push a sine through the processor and estimate the output frequency from zero crossings. */
function outputFrequency(settings: { ratio: number; ringHz: number }, inHz = 220): number {
  const p = new Ctor();
  p.port.onmessage({ data: settings });
  const block = 128;
  const seconds = 1;
  const total = 48000 * seconds;
  const out: number[] = [];
  for (let start = 0; start < total; start += block) {
    const input = new Float32Array(block).map((_, i) => Math.sin((2 * Math.PI * inHz * (start + i)) / 48000));
    const output = [new Float32Array(block)];
    p.process([[input]], [output]);
    out.push(...output[0]);
  }
  // Skip the first 100 ms while the delay line fills.
  const steady = out.slice(4800);
  let crossings = 0;
  for (let i = 1; i < steady.length; i++) if (steady[i - 1] < 0 && steady[i] >= 0) crossings++;
  return crossings / (steady.length / 48000);
}

describe("voice filter worklet", () => {
  it("passes audio through unchanged when off", () => {
    expect(outputFrequency({ ratio: 1, ringHz: 0 })).toBeCloseTo(220, -1);
  });
  it("lowers the pitch for Deep", () => {
    const f = outputFrequency({ ratio: 0.72, ringHz: 0 });
    expect(f).toBeGreaterThan(220 * 0.72 * 0.9);
    expect(f).toBeLessThan(220 * 0.72 * 1.1);
  });
  it("raises the pitch for High", () => {
    const f = outputFrequency({ ratio: 1.4, ringHz: 0 });
    expect(f).toBeGreaterThan(220 * 1.4 * 0.9);
    expect(f).toBeLessThan(220 * 1.4 * 1.1);
  });
});
