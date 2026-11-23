// AudioWorklet that disguises a voice before it leaves the device.
//
// Pitch shift: two read heads sweep through a short delay line at a speed set by
// the pitch ratio, cross-fading so each head is silent when it jumps back. This
// shifts pitch without changing speed. Optional ring modulation (multiplying by a
// low sine) adds a metallic "robot" quality on top.
//
// Plain JS (not TypeScript) because it's loaded as-is by audioWorklet.addModule.

const WINDOW = 1024; // samples per sweep (~21 ms at 48 kHz)
const BUFFER = 4096; // delay line, must exceed WINDOW + 2

class VoiceFilterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(BUFFER);
    this.write = 0;
    this.phase = 0;
    this.ratio = 1;
    this.ringHz = 0;
    this.ringPhase = 0;
    this.port.onmessage = (e) => {
      if (typeof e.data.ratio === "number") this.ratio = e.data.ratio;
      if (typeof e.data.ringHz === "number") this.ringHz = e.data.ringHz;
    };
  }

  read(delay) {
    let pos = this.write - delay;
    while (pos < 0) pos += BUFFER;
    const i = Math.floor(pos);
    const frac = pos - i;
    const a = this.buffer[i % BUFFER];
    const b = this.buffer[(i + 1) % BUFFER];
    return a + (b - a) * frac;
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const out = output[0];
    const step = (1 - this.ratio) / WINDOW;
    const ringStep = (2 * Math.PI * this.ringHz) / sampleRate;

    for (let n = 0; n < out.length; n++) {
      this.buffer[this.write] = input ? input[n] : 0;

      let sample;
      if (this.ratio === 1) {
        sample = this.buffer[this.write];
      } else {
        const p1 = this.phase;
        const p2 = (this.phase + 0.5) % 1;
        // Triangle windows offset by half a sweep always sum to 1.
        const g1 = 1 - Math.abs(2 * p1 - 1);
        const g2 = 1 - Math.abs(2 * p2 - 1);
        sample = this.read(1 + p1 * WINDOW) * g1 + this.read(1 + p2 * WINDOW) * g2;
        this.phase += step;
        if (this.phase >= 1) this.phase -= 1;
        if (this.phase < 0) this.phase += 1;
      }

      if (this.ringHz > 0) {
        sample *= Math.sin(this.ringPhase);
        this.ringPhase += ringStep;
        if (this.ringPhase > 2 * Math.PI) this.ringPhase -= 2 * Math.PI;
      }

      for (let c = 0; c < output.length; c++) output[c][n] = sample;
      this.write = (this.write + 1) % BUFFER;
    }
    return true;
  }
}

registerProcessor("voice-filter", VoiceFilterProcessor);
