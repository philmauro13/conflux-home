// HeartbeatGlobal — module-level singleton for heartbeat interval
// Persists across React component unmounts/mounts.
// Any component subscribes via subscribe(); all share the same ticking clock.

import { invoke } from '@tauri-apps/api/core';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface HeartbeatConfig {
  intervalMs: number;      // current interval (0 = off)
  lastBeatMs: number;      // timestamp of last beat (from Rust backend)
}

interface Listener {
  id: string;
  onBeat: (timestamp: number) => void;
}

// ── Singleton State ────────────────────────────────────────────────────────────

let config: HeartbeatConfig = {
  intervalMs: 30 * 60 * 1000, // default: 30 min
  lastBeatMs: Date.now(),
};

let listeners: Listener[] = [];
let tickInterval: ReturnType<typeof setInterval> | null = null;
let rustIntervalMs: number | null = null;
let beatCount = 0;

// ── Helpers (declared before startTick so hoisting is unambiguous) ─────────────

function stopTick() {
  if (tickInterval !== null) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

function fireBeat(): void {
  beatCount++;
  config.lastBeatMs = Date.now();
  const ts = config.lastBeatMs;
  listeners.forEach(l => {
    try { l.onBeat(ts); } catch (e) { console.warn('[HeartbeatGlobal]', e); }
  });
  syncFromRust();
}

async function syncFromRust(): Promise<void> {
  try {
    const rustMs: number = await invoke('engine_get_heartbeat_interval');
    if (rustMs !== rustIntervalMs) {
      rustIntervalMs = rustMs;
      if (rustMs !== config.intervalMs) {
        config.intervalMs = rustMs;
        startTick();
      }
    }
    const stored = await invoke<string>('engine_get_heartbeat_last_beat').catch(() => null);
    if (stored && !isNaN(Number(stored))) {
      config.lastBeatMs = Number(stored);
    }
  } catch {
    // Non-fatal — keep ticking with local state
  }
}

function startTick(): void {
  stopTick();
  if (config.intervalMs === 0) return;

  // Catch up: if overdue since last beat, fire immediately
  const elapsed = Date.now() - config.lastBeatMs;
  const remaining = config.intervalMs - elapsed;

  if (remaining <= 0) {
    fireBeat();
  }

  // Schedule recurring tick from NOW (not from lastBeat)
  tickInterval = setInterval(fireBeat, config.intervalMs);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the global heartbeat from the Rust backend.
 * Call once at app startup.
 */
export async function initHeartbeatGlobal(): Promise<void> {
  try {
    const rustMs: number = await invoke('engine_get_heartbeat_interval');
    rustIntervalMs = rustMs;
    config.intervalMs = rustMs;
    try {
      const stored = await invoke<string>('engine_get_heartbeat_last_beat');
      if (stored && !isNaN(Number(stored))) {
        config.lastBeatMs = Number(stored);
      } else {
        config.lastBeatMs = Date.now();
      }
    } catch {
      config.lastBeatMs = Date.now();
    }
    startTick();
  } catch (e) {
    console.warn('[HeartbeatGlobal] Failed to init:', e);
    startTick();
  }
}

/**
 * Update the interval — called from PulseKnob when user changes the setting.
 */
export function setHeartbeatInterval(ms: number): void {
  config.intervalMs = ms;
  startTick();
}

/**
 * Force a beat (e.g., when Rust fires a heartbeat event).
 */
export function pulseBeat(): void {
  config.lastBeatMs = Date.now();
  fireBeat();
}

/**
 * Subscribe to beat events. Returns an unsubscribe function.
 */
export function subscribe(onBeat: (timestamp: number) => void): () => void {
  const id = `beat_${Date.now()}_${Math.random()}`;
  listeners.push({ id, onBeat });
  // Immediately call with current lastBeat so the component isn't behind
  onBeat(config.lastBeatMs);
  return () => {
    listeners = listeners.filter(l => l.id !== id);
    if (listeners.length === 0) {
      stopTick();
    }
  };
}

/**
 * Get current config for any one-off reads.
 */
export function getHeartbeatConfig(): HeartbeatConfig {
  return { ...config };
}
