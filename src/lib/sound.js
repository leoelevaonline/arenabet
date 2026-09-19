// Synthesized sound effects via the Web Audio API.
// Every sound is generated on the fly, so there are no audio assets to ship:
// it works offline and keeps the repository free of binary files.
// A mute preference is persisted in localStorage and shared across the app.

const STORAGE_KEY = "arenabet.muted.v1";

let audioCtx = null;
let muted = readMuted();
const listeners = new Set();

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function setMuted(next) {
  muted = Boolean(next);
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  } catch {
    // noop
  }
  listeners.forEach((fn) => {
    try {
      fn(muted);
    } catch {
      // noop
    }
  });
  return muted;
}

export function toggleMuted() {
  return setMuted(!muted);
}

export function subscribeMuted(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getCtx() {
  if (typeof window === "undefined") return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

// Browsers block audio until the first user gesture. Warm the context up on the
// earliest interaction so the first in-game sound actually plays.
if (typeof window !== "undefined") {
  const warm = () => getCtx();
  window.addEventListener("pointerdown", warm, { passive: true });
  window.addEventListener("keydown", warm, { passive: true });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tone({ freq = 440, type = "sine", duration = 0.15, gain = 0.2, attack = 0.006, freqTo = null, delay = 0 }) {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), start + duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noise({ duration = 0.2, gain = 0.2, type = "highpass", frequency = 800, delay = 0 }) {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  const start = audio.currentTime + delay;
  const frames = Math.max(1, Math.floor(audio.sampleRate * duration));
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const amp = audio.createGain();
  amp.gain.setValueAtTime(Math.max(0.0002, gain), start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(filter).connect(amp).connect(audio.destination);
  src.start(start);
  src.stop(start + duration + 0.03);
}

function melody(freqs, { type = "triangle", step = 0.11, duration = 0.26, gain = 0.18 } = {}) {
  freqs.forEach((freq, index) => tone({ freq, type, duration, gain, delay: index * step }));
}

export const sfx = {
  // Generic UI
  click: () => tone({ freq: 330, type: "triangle", duration: 0.06, gain: 0.1 }),
  bet: () => {
    tone({ freq: 520, type: "triangle", duration: 0.08, gain: 0.16 });
    tone({ freq: 780, type: "triangle", duration: 0.12, gain: 0.14, delay: 0.07 });
  },
  end: () => tone({ freq: 300, freqTo: 130, type: "sawtooth", duration: 0.34, gain: 0.16 }),

  // Sinuca / Bocha
  hit: (intensity = 1) => {
    const strength = clamp(intensity, 0.1, 1);
    tone({ freq: 170 + strength * 70, type: "square", duration: 0.05, gain: strength * 0.16 });
    noise({ duration: 0.05, gain: strength * 0.22, type: "highpass", frequency: 1300 });
  },
  bochaLaunch: (power = 0.5, shotType = "ponto") => {
    const p = clamp(power, 0.1, 1);
    if (shotType === "bochada") {
      // Arremesso forte e seco com projeção na terra batida
      tone({ freq: 110 + p * 60, freqTo: 45, type: "triangle", duration: 0.14, gain: 0.28 * p });
      noise({ duration: 0.16, gain: 0.32 * p, type: "bandpass", frequency: 450 });
    } else {
      // Arrimo / Ponto: deslizamento suave no saibro
      tone({ freq: 140, freqTo: 70, type: "sine", duration: 0.12, gain: 0.18 * p });
      noise({ duration: 0.2, gain: 0.18 * p, type: "lowpass", frequency: 650 });
    }
  },
  bochaClack: (intensity = 0.8) => {
    // Som encorpado e oco de bochas de resina pesada se chocando (o clássico estalo da bocha gaúcha)
    const strength = clamp(intensity, 0.15, 1);
    tone({ freq: 360 + Math.random() * 40, freqTo: 140, type: "triangle", duration: 0.07, gain: strength * 0.35 });
    tone({ freq: 180, freqTo: 60, type: "sine", duration: 0.1, gain: strength * 0.32, delay: 0.005 });
    noise({ duration: 0.04, gain: strength * 0.38, type: "bandpass", frequency: 1600 });
  },
  bochaCushion: (intensity = 0.5) => {
    // Impacto sutil e abafado na madeira nobre da lateral da cancha
    const strength = clamp(intensity, 0.1, 1);
    tone({ freq: 95, freqTo: 40, type: "sine", duration: 0.11, gain: strength * 0.25 });
    noise({ duration: 0.08, gain: strength * 0.2, type: "lowpass", frequency: 320 });
  },
  rail: () => tone({ freq: 130, type: "square", duration: 0.06, gain: 0.09 }),
  pocket: () => {
    tone({ freq: 300, freqTo: 90, type: "sine", duration: 0.22, gain: 0.2 });
    noise({ duration: 0.13, gain: 0.08, type: "lowpass", frequency: 480 });
  },

  // Futebol de mesa
  kick: () => {
    tone({ freq: 170, freqTo: 60, type: "sine", duration: 0.12, gain: 0.26 });
    noise({ duration: 0.06, gain: 0.12, type: "lowpass", frequency: 900 });
  },
  goal: () => melody([523, 659, 784, 1046, 1318], { type: "sawtooth", step: 0.09, duration: 0.24, gain: 0.16 }),
  whistle: () => {
    tone({ freq: 2050, type: "sine", duration: 0.12, gain: 0.1 });
    tone({ freq: 2300, type: "sine", duration: 0.18, gain: 0.1, delay: 0.13 });
  },

  // Board games
  move: () => tone({ freq: 300, type: "triangle", duration: 0.07, gain: 0.12 }),
  capture: () => {
    tone({ freq: 260, freqTo: 110, type: "square", duration: 0.12, gain: 0.16 });
    noise({ duration: 0.08, gain: 0.1, type: "highpass", frequency: 900 });
  },

  // Cards / coin
  card: () => noise({ duration: 0.13, gain: 0.14, type: "highpass", frequency: 1700 }),
  flip: () => tone({ freq: 680, freqTo: 1250, type: "triangle", duration: 0.32, gain: 0.12 }),

  // Outcomes
  win: () => melody([523, 659, 784, 1046], { type: "triangle", step: 0.1, duration: 0.28, gain: 0.18 }),
  lose: () => melody([392, 330, 262], { type: "sawtooth", step: 0.12, duration: 0.3, gain: 0.16 }),
  draw: () => melody([440, 392], { type: "triangle", step: 0.16, duration: 0.22, gain: 0.15 }),
};
