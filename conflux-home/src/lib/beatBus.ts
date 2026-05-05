// BeatEventBus — shared event system for agent heartbeat beats
// Any component can emit a beat event; any component can subscribe.
// Uses a global window custom event so it's zero-coupling across the codebase.

import { useState, useEffect, useRef } from 'react';

export interface BeatEvent {
  id: string;
  agentId: string;
  agentLabel: string;
  action: string;
  detail?: string;
  type: 'info' | 'success' | 'warn';
  timestamp: number;
}

export const AGENTS = [
  { id: 'conflux', label: 'Conflux', emoji: '🤖', color: '#8b5cf6' },
  { id: 'helix',   label: 'Helix',   emoji: '🔬', color: '#a78bfa' },
  { id: 'pulse',   label: 'Pulse',   emoji: '💚', color: '#34d399' },
  { id: 'hearth',  label: 'Hearth',  emoji: '🔥', color: '#fb923c' },
  { id: 'echo',    label: 'Echo',    emoji: '🫂', color: '#f472b6' },
  { id: 'aegis',   label: 'Aegis',   emoji: '🛡️', color: '#38bdf8' },
  { id: 'viper',   label: 'Viper',   emoji: '🐍', color: '#22c55e' },
  { id: 'forge',   label: 'Forge',   emoji: '🔨', color: '#f97316' },
  { id: 'orbit',   label: 'Orbit',    emoji: '🧠', color: '#e879f9' },
  { id: 'horizon', label: 'Horizon',  emoji: '🎯', color: '#f472b6' },
] as const;

export type AgentId = typeof AGENTS[number]['id'];

// ── Bus ────────────────────────────────────────────────────────────────────────
const BEAT_BUS = 'conflux:beat-event';
let _beatCounter = 0;

export function emitBeat(event: Omit<BeatEvent, 'id' | 'timestamp'>) {
  const full: BeatEvent = {
    ...event,
    id: `beat-${Date.now()}-${++_beatCounter}`,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent(BEAT_BUS, { detail: full }));
}

// ── Timeline hook ──────────────────────────────────────────────────────────────
const MAX_EVENTS = 20;

export function useBeatTimeline() {
  const [events, setEvents] = useState<BeatEvent[]>([]);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const beat = (e as CustomEvent<BeatEvent>).detail;
      if (beat.id === prevIdRef.current) return;
      prevIdRef.current = beat.id;
      setEvents(prev => [beat, ...prev].slice(0, MAX_EVENTS));
    };
    window.addEventListener(BEAT_BUS, handler as EventListener);
    return () => window.removeEventListener(BEAT_BUS, handler as EventListener);
  }, []);

  return events;
}

// ── Per-agent last-active hook ────────────────────────────────────────────────
export function useAgentActivity(agentId: string) {
  const [lastActive, setLastActive] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const beat = (e as CustomEvent<BeatEvent>).detail;
      if (beat.agentId !== agentId) return;
      setLastActive(Date.now());
      setIsActive(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsActive(false), 3000);
    };
    window.addEventListener(BEAT_BUS, handler as EventListener);
    return () => window.removeEventListener(BEAT_BUS, handler as EventListener);
  }, [agentId]);

  return { lastActive, isActive };
}

// ── Demo beat generator ────────────────────────────────────────────────────────
const DEMO_BEATS: Omit<BeatEvent, 'id' | 'timestamp'>[] = [
  { agentId: 'helix',   agentLabel: 'Helix',   action: 'checked market signals',      detail: 'AAPL +1.8% · TSLA +3.2%',        type: 'info' },
  { agentId: 'helix',   agentLabel: 'Helix',   action: 'scanned startup ecosystem',   detail: '17 new companies today',         type: 'info' },
  { agentId: 'forge',   agentLabel: 'Forge',   action: 'completed background task',   detail: 'Product spec v2.4 exported',   type: 'success' },
  { agentId: 'forge',   agentLabel: 'Forge',   action: 'ran code review',             detail: '3 PRs · 0 critical issues',     type: 'success' },
  { agentId: 'aegis',   agentLabel: 'Aegis',   action: 'verified system integrity',   detail: 'All systems nominal',           type: 'success' },
  { agentId: 'aegis',   agentLabel: 'Aegis',   action: 'monitored access logs',      detail: '0 anomalies detected',         type: 'info' },
  { agentId: 'pulse',   agentLabel: 'Pulse',   action: 'tracked daily spending',      detail: '$127 of $500 budget remaining', type: 'info' },
  { agentId: 'pulse',   agentLabel: 'Pulse',   action: 'detected budget opportunity', detail: 'You saved $40 vs last month',  type: 'success' },
  { agentId: 'hearth',  agentLabel: 'Hearth',  action: 'checked pantry status',       detail: '3 items running low',          type: 'warn' },
  { agentId: 'hearth',  agentLabel: 'Hearth',  action: 'suggested this week\'s meals', detail: '12 recipes matched your prefs', type: 'info' },
  { agentId: 'orbit',   agentLabel: 'Orbit',   action: 'logged task completions',    detail: '3 tasks done today',            type: 'success' },
  { agentId: 'orbit',   agentLabel: 'Orbit',   action: 'sent evening nudge',         detail: '2 tasks pending for tomorrow', type: 'info' },
  { agentId: 'horizon', agentLabel: 'Horizon', action: 'updated dream progress',     detail: 'Milestone 3/7 complete',       type: 'success' },
  { agentId: 'horizon', agentLabel: 'Horizon', action: 'celebrated streak',         detail: '7-day streak intact 🎉',       type: 'success' },
];

let _demoBeatTimer: ReturnType<typeof setTimeout> | null = null;
let _demoBeatIndex = 0;

export function startDemoBeats(intervalMs = 45000) {
  if (_demoBeatTimer) return;
  function fire() {
    const beat = DEMO_BEATS[_demoBeatIndex % DEMO_BEATS.length];
    _demoBeatIndex++;
    emitBeat({ ...beat } as Omit<BeatEvent, 'id' | 'timestamp'>);
    _demoBeatTimer = setTimeout(fire, intervalMs + Math.random() * 30000);
  }
  // First beat fires quickly, then settles into rhythm
  _demoBeatTimer = setTimeout(fire, 4000);
}

export function stopDemoBeats() {
  if (_demoBeatTimer) {
    clearTimeout(_demoBeatTimer);
    _demoBeatTimer = null;
  }
}
