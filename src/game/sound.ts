/** Tiny Web Audio synth, so the game has sound without audio assets. */

const MUTE_KEY = 'juicerush.muted';
let ctx: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
  } catch {
    return null;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  slideTo?: number;
}

function tone(freq: number, dur: number, { type = 'sine', gain = 0.15, delay = 0, slideTo }: ToneOpts = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

interface NoiseOpts {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  sweepTo?: number;
  q?: number;
  delay?: number;
}

function noise(dur: number, { gain = 0.3, filter = 'highpass', freq = 2000, sweepTo, q = 1, delay = 0 }: NoiseOpts = {}) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sound = {
  start: () => {
    tone(330, 0.09, { type: 'triangle', gain: 0.1 });
    tone(495, 0.12, { type: 'triangle', gain: 0.1, delay: 0.08 });
  },
  toss: () => tone(170, 0.14, { gain: 0.07, slideTo: 260 }),
  swipe: () => noise(0.16, { gain: 0.1, filter: 'bandpass', freq: 900, sweepTo: 4200, q: 2.5 }),
  /** The blade bites in: the result isn't known yet. */
  chop: () => {
    noise(0.07, { gain: 0.35, filter: 'highpass', freq: 3000 });
    tone(900, 0.05, { type: 'square', gain: 0.03 });
  },
  /** Safe slice; `step` raises the pitch as the streak grows. */
  squish: (step: number) => {
    noise(0.14, { gain: 0.4, filter: 'lowpass', freq: 1100 });
    const base = 520 * 2 ** (Math.min(step, 14) / 12);
    tone(base, 0.12, { type: 'triangle', gain: 0.12, delay: 0.03 });
    tone(base * 1.5, 0.18, { type: 'triangle', gain: 0.09, delay: 0.09 });
  },
  fuse: () => noise(0.35, { gain: 0.1, filter: 'highpass', freq: 5000 }),
  boom: () => {
    noise(1.6, { gain: 0.9, filter: 'lowpass', freq: 800 });
    tone(110, 1.2, { gain: 0.6, slideTo: 28 });
  },
  cash: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.12, delay: i * 0.07 })),
  jackpot: () => {
    [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.12, delay: i * 0.08 }));
    tone(1568, 0.6, { gain: 0.08, delay: 0.45 });
  },
  isMuted: () => muted,
  setMuted(next: boolean) {
    muted = next;
    try {
      localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  },
};
