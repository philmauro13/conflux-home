// Web Audio API sound system for Conflux Home onboarding
// All sounds are synthesized — no external audio files

// ---------------------------------------------------------------------------
// Audio Context (lazy singleton)
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// ---------------------------------------------------------------------------
// Preferences (localStorage)
// ---------------------------------------------------------------------------

const VOLUME_KEY = 'conflux-sound-volume';
const ENABLED_KEY = 'conflux-sound-enabled';

function getMasterVolume(): number {
  if (typeof window === 'undefined') return 0.5;
  const stored = localStorage.getItem(VOLUME_KEY);
  if (stored === null) return 0.5;
  const v = parseFloat(stored);
  return isNaN(v) ? 0.5 : Math.min(1, Math.max(0, v));
}

export function setMasterVolume(level: number): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(VOLUME_KEY, String(Math.min(1, Math.max(0, level))));
}

export function muteAllSounds(): void {
  setMasterVolume(0);
}

export function unmuteAllSounds(): void {
  setMasterVolume(0.5);
}

export function getSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(ENABLED_KEY) !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ENABLED_KEY, String(enabled));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectiveVolume(base: number): number {
  return base * getMasterVolume();
}

// ---------------------------------------------------------------------------
// Sound 1: Heartbeat Pulse
// ---------------------------------------------------------------------------

export function playHeartbeatPulse(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.15);

  // Gain node for master envelope
  const master = ctx.createGain();
  master.gain.setValueAtTime(vol, now);
  master.connect(ctx.destination);

  // "Lub" — 60 Hz
  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(60, now);

  const gain1 = ctx.createGain();
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(1, now + 0.01); // quick attack
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1); // slow decay

  osc1.connect(gain1);
  gain1.connect(master);
  osc1.start(now);
  osc1.stop(now + 0.12);

  // "Dub" — 50 Hz, 150ms later
  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(50, now + 0.15);

  const gain2 = ctx.createGain();
  gain2.gain.setValueAtTime(0, now + 0.15);
  gain2.gain.linearRampToValueAtTime(0.8, now + 0.16);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc2.connect(gain2);
  gain2.connect(master);
  osc2.start(now + 0.15);
  osc2.stop(now + 0.27);
}

// ---------------------------------------------------------------------------
// Sound 2: Boot-Up Tone
// ---------------------------------------------------------------------------

export function playBootUpTone(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.1);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.8);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.65);
  gain.gain.linearRampToValueAtTime(0, now + 0.8);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.85);
}

// ---------------------------------------------------------------------------
// Sound 3: Agent Wake
// ---------------------------------------------------------------------------

export function playAgentWake(agentIndex: number): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.08);
  const freq = 300 + agentIndex * 50;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(vol, now + 0.015); // quick attack
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2); // quick decay

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

// ---------------------------------------------------------------------------
// Sound 4: Welcome Chime
// ---------------------------------------------------------------------------

export function playWelcomeChime(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.12);

  const notes = [523, 659, 784]; // C5, E5, G5

  notes.forEach((freq, i) => {
    const startAt = now + i * 0.1;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startAt);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(vol, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startAt + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + 0.42);
  });
}

// ---------------------------------------------------------------------------
// Sound 5: Ambient Hum
// ---------------------------------------------------------------------------

export function startAmbientHum(): { stop: () => void } {
  if (!getSoundEnabled()) {
    return { stop: () => {} };
  }

  const ctx = getAudioContext();
  const vol = effectiveVolume(0.03);

  const osc1 = ctx.createOscillator();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(60, ctx.currentTime);

  const osc2 = ctx.createOscillator();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(120, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, ctx.currentTime);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start();
  osc2.start();

  return {
    stop: () => {
      const t = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc1.stop(t + 0.55);
      osc2.stop(t + 0.55);
    },
  };
}

// ---------------------------------------------------------------------------
// Sound 6: UI Click
// ---------------------------------------------------------------------------

export function playUIClick(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.05);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1000, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

// ══════════════════════════════════════════════════════════════════════════════
// AMBIENT SOUNDSCAPES — Per-App Loops
// Each function returns a stop() function. Call stop() when leaving the app.
// ══════════════════════════════════════════════════════════════════════════════

function createLoopingSource(ctx: AudioContext, bufferSize = 4096): AudioBufferSourceNode {
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Brown noise (integrated white noise — warm, non-harsh)
  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = data[i];
    data[i] *= 3.5; // normalize
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  return source;
}

// ── Pulse (Budget) — Deep heartbeat drone ──────────────────────────────────
export function startPulseAmbient(): () => void {
  if (!getSoundEnabled()) return () => {};
  const ctx = getAudioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(effectiveVolume(0.04), ctx.currentTime);
  master.connect(ctx.destination);

  // Base drone: 55 Hz sine
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.setValueAtTime(55, ctx.currentTime);
  const droneGain = ctx.createGain();
  droneGain.gain.setValueAtTime(0.6, ctx.currentTime);
  drone.connect(droneGain);
  droneGain.connect(master);
  drone.start();

  // Sub-harmonic: 27.5 Hz sine (sub-bass depth)
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(27.5, ctx.currentTime);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.4, ctx.currentTime);
  sub.connect(subGain);
  subGain.connect(master);
  sub.start();

  // Heartbeat LFO — amplitude modulation every 1.2s
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.83, ctx.currentTime); // ~1.2s period
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.4, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(droneGain.gain);
  lfo.start();

  // Occasional "lub-dub" accent every ~4 beats
  let beatCount = 0;
  const interval = setInterval(() => {
    beatCount++;
    if (beatCount % 4 === 0) {
      const now = ctx.currentTime;
      const accent = ctx.createOscillator();
      accent.type = 'sine';
      accent.frequency.setValueAtTime(60, now);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0, now);
      ag.gain.linearRampToValueAtTime(effectiveVolume(0.08), now + 0.01);
      ag.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      accent.connect(ag);
      ag.connect(master);
      accent.start(now);
      accent.stop(now + 0.14);
    }
  }, 1200);

  return () => {
    clearInterval(interval);
    try { drone.stop(); sub.stop(); lfo.stop(); } catch {}
    try { master.disconnect(); } catch {}
  };
}

// ── Hearth (Kitchen) — Warm amber crackle ──────────────────────────────────
export function startHearthAmbient(): () => void {
  if (!getSoundEnabled()) return () => {};
  const ctx = getAudioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(effectiveVolume(0.03), ctx.currentTime);
  master.connect(ctx.destination);

  // Brown noise (warm ambient)
  const noise = createLoopingSource(ctx);
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(800, ctx.currentTime);
  noiseFilter.Q.setValueAtTime(0.5, ctx.currentTime);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.5, ctx.currentTime);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start();

  // Gentle warm tone: 174 Hz (Solfeggio — "healing" frequency)
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(174, ctx.currentTime);
  const toneGain = ctx.createGain();
  toneGain.gain.setValueAtTime(0.15, ctx.currentTime);
  tone.connect(toneGain);
  toneGain.connect(master);
  tone.start();

  // Subtle shimmer LFO on the tone
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.2, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(8, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(tone.frequency);
  lfo.start();

  // Random soft "crackle" pops
  const crackleInterval = setInterval(() => {
    if (Math.random() > 0.6) {
      const now = ctx.currentTime;
      const pop = ctx.createOscillator();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(300 + Math.random() * 400, now);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0, now);
      pg.gain.linearRampToValueAtTime(effectiveVolume(0.05), now + 0.003);
      pg.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      pop.connect(pg);
      pg.connect(master);
      pop.start(now);
      pop.stop(now + 0.05);
    }
  }, 800);

  return () => {
    clearInterval(crackleInterval);
    try { noise.stop(); tone.stop(); lfo.stop(); } catch {}
    try { master.disconnect(); } catch {}
  };
}

// ── Orbit (Life) — Ethereal high-altitude hum ──────────────────────────────
export function startOrbitAmbient(): () => void {
  if (!getSoundEnabled()) return () => {};
  const ctx = getAudioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(effectiveVolume(0.025), ctx.currentTime);
  master.connect(ctx.destination);

  // Ethereal high drone: 396 Hz (Solfeggio — letting go)
  const drone1 = ctx.createOscillator();
  drone1.type = 'sine';
  drone1.frequency.setValueAtTime(396, ctx.currentTime);
  const d1g = ctx.createGain();
  d1g.gain.setValueAtTime(0.3, ctx.currentTime);
  drone1.connect(d1g);
  d1g.connect(master);
  drone1.start();

  // Octave above: 792 Hz
  const drone2 = ctx.createOscillator();
  drone2.type = 'sine';
  drone2.frequency.setValueAtTime(792, ctx.currentTime);
  const d2g = ctx.createGain();
  d2g.gain.setValueAtTime(0.12, ctx.currentTime);
  drone2.connect(d2g);
  d2g.connect(master);
  drone2.start();

  // Slow shimmer LFO
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.1, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.08, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(d1g.gain);
  lfo.start();

  // Sub-bass pad: 40 Hz very quiet
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(40, ctx.currentTime);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.2, ctx.currentTime);
  sub.connect(sg);
  sg.connect(master);
  sub.start();

  return () => {
    try { drone1.stop(); drone2.stop(); lfo.stop(); sub.stop(); } catch {}
    try { master.disconnect(); } catch {}
  };
}

// ── Echo (Counselor) — Deep calm, near-silence ────────────────────────────
export function startEchoAmbient(): () => void {
  if (!getSoundEnabled()) return () => {};
  const ctx = getAudioContext();
  const master = ctx.createGain();
  master.gain.setValueAtTime(effectiveVolume(0.02), ctx.currentTime);
  master.connect(ctx.destination);

  // Very low calm drone: 72 Hz
  const drone = ctx.createOscillator();
  drone.type = 'sine';
  drone.frequency.setValueAtTime(72, ctx.currentTime);
  const dg = ctx.createGain();
  dg.gain.setValueAtTime(0.4, ctx.currentTime);
  drone.connect(dg);
  dg.connect(master);
  drone.start();

  // Third harmonic: 216 Hz very soft
  const harm = ctx.createOscillator();
  harm.type = 'sine';
  harm.frequency.setValueAtTime(216, ctx.currentTime);
  const hg = ctx.createGain();
  hg.gain.setValueAtTime(0.08, ctx.currentTime);
  harm.connect(hg);
  hg.connect(master);
  harm.start();

  // Very slow amplitude breathing LFO (8s period)
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.125, ctx.currentTime);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.2, ctx.currentTime);
  lfo.connect(lfoGain);
  lfoGain.connect(dg.gain);
  lfo.start();

  return () => {
    try { drone.stop(); harm.stop(); lfo.stop(); } catch {}
    try { master.disconnect(); } catch {}
  };
}

// ── Fairy Sounds ─────────────────────────────────────────────────────────────

export function playFairyChime(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.08);

  // Three ascending notes: C5 → E5 → G5 (major chord arpeggio)
  const freqs = [523.25, 659.25, 783.99];
  freqs.forEach((freq, i) => {
    const t = now + i * 0.08;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}

export function playFairySparkle(): void {
  if (!getSoundEnabled()) return;
  const ctx = getAudioContext();
  const now = ctx.currentTime;
  const vol = effectiveVolume(0.06);

  // High shimmer burst
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(2000, now);
  osc.frequency.exponentialRampToValueAtTime(4000, now + 0.1);
  osc.frequency.exponentialRampToValueAtTime(2500, now + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.28);
}
