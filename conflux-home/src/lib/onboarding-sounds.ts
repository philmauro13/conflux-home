// Sound Manager — Extended onboarding boot sounds
// Part of the OnboardingCinematic redesign

import { soundManager } from './sound';

// ── Boot Sequence Sounds ──

let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Conflux Logo Reveal — warm harmonic chord (C major + 9th)
export function playLogoReveal(): void {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  gain.connect(ctx.destination);

  // C major chord with added 9th (sweet, welcoming)
  [261.63, 329.63, 392.00, 493.88].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.06);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now + i * 0.06);
    env.gain.linearRampToValueAtTime(0.15, now + i * 0.06 + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.85 + i * 0.06);
    osc.connect(env);
    env.connect(gain);
    osc.start(now + i * 0.06);
    osc.stop(now + 0.9 + i * 0.06);
  });
}

// Neural Brain Activating — soft power-on sweep
export function playBrainActivate(): void {
  const ctx = getCtx();
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.5);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.65);
}

// Agent Card Appear — short crystalline chime
export function playAgentAppear(agentId: string): void {
  const ctx = getCtx();
  const now = ctx.currentTime;

  // Different base notes per agent for audio variety
  const agentNotes: Record<string, number[]> = {
    conflux: [523.25, 659.25, 783.99],
    helix:   [369.99, 493.88, 587.33],
    pulse:   [329.63, 415.30, 523.25],
    hearth:  [293.66, 392.00, 493.88],
    echo:    [440.00, 554.37, 659.25],
    aegis:   [246.94, 329.63, 440.00],
    viper:   [392.00, 493.88, 587.33],
  };
  const notes = agentNotes[agentId] || agentNotes.conflux;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.gain.linearRampToValueAtTime(0.2, now + 0.01);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
  masterGain.connect(ctx.destination);

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.07);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now + i * 0.07);
    env.gain.linearRampToValueAtTime(0.15, now + i * 0.07 + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.3 + i * 0.07);
    osc.connect(env);
    env.connect(masterGain);
    osc.start(now + i * 0.07);
    osc.stop(now + 0.35 + i * 0.07);
  });
}

// Conflux Narration Start — subtle signal tone before voice
export function playNarrationSignal(): void {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, now);
  osc.frequency.setValueAtTime(1108, now + 0.06);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.08, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

// Heartbeat while waiting for name input
export function playOnboardingHeartbeat(): void {
  soundManager.playHeartbeat();
}

// Team Alive — celebratory chord when all agents introduced
export function playTeamAliveNew(): void {
  soundManager.playTeamAlive();
}

// Build complete — triumphant ascending arpeggio
export function playBuildComplete(): void {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.22, now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  masterGain.connect(ctx.destination);

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + i * 0.07);
    osc.connect(masterGain);
    osc.start(now + i * 0.07);
    osc.stop(now + 1.0 + i * 0.07);
  });
}

// Voice button click — small feedback blip
export function playVoiceClick(): void {
  const ctx = getCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(1600, now + 0.04);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.1, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

  osc.connect(env);
  env.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.1);
}