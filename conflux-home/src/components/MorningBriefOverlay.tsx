// MorningBriefOverlay — First-app-open-of-day experience
// Appears when the user opens their first app of the day (after 5am)
// Shows overnight summary, top tasks, budget status, weather, pending nudges

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfluxPresence, type FairyExpression } from './conflux';
import { invoke } from '@tauri-apps/api/core';
import { playFairyChime } from '../lib/sound';
import { DEFAULT_COMMAND } from '../lib/neuralBrain';
import './MorningBrief.css';

export interface MorningBriefData {
  greeting: string;           // "Good morning, Don"
  date: string;               // "Saturday, April 18"
  tasksTop: string[];         // Top 3 pending tasks
  tasksCount: number;         // Total pending
  budgetStatus: string;       // "You've spent $340 of your $500 budget"
  budgetPace: 'on-track' | 'over' | 'under';
  dreamStreak: number;        // Days on streak
  weather?: string;           // "62°F and sunny"
  weatherIcon?: string;       // "☀️"
  nudgeCount: number;         // How many nudges are pending
  firstNudgeText?: string;    // Preview of most urgent nudge
}

const STORAGE_KEY = 'conflux-morning-brief-date';
const DISMISSED_KEY = 'conflux-morning-brief-dismissed';

function shouldShowBrief(): boolean {
  const now = new Date();
  const hour = now.getHours();
  // Show between 5am and noon
  if (hour < 5 || hour >= 12) return false;

  const today = new Date().toDateString();
  const lastShown = localStorage.getItem(STORAGE_KEY);
  const dismissed = localStorage.getItem(DISMISSED_KEY);

  // Don't show if already dismissed today
  if (dismissed === today) return false;
  // Show if never shown today
  if (lastShown !== today) return true;
  return false;
}

function markBriefShown() {
  localStorage.setItem(STORAGE_KEY, new Date().toDateString());
}

function markBriefDismissed() {
  localStorage.setItem(DISMISSED_KEY, new Date().toDateString());
}

// ── Build brief data from app state ────────────────────────────────────────────
async function buildBriefData(): Promise<MorningBriefData> {
  const now = new Date();
  const hour = now.getHours();
  const name = 'Don'; // TODO: pull from user profile

  const greeting = hour < 12 ? 'Good morning' : 'Good afternoon';

  // Day name + date
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Fetch task count from Orbit
  let tasksTop: string[] = [];
  let tasksCount = 0;
  try {
    const { data } = await invoke<any>('life_get_dashboard').catch(() => null);
    if (data) {
      const pending = data.pending_tasks ?? [];
      tasksCount = pending.length;
      tasksTop = pending.slice(0, 3).map((t: any) => t.title ?? t.text ?? 'Untitled task');
    }
  } catch {}

  // Fetch budget status from Pulse
  let budgetStatus = '';
  let budgetPace: 'on-track' | 'over' | 'under' = 'on-track';
  try {
    const { data } = await invoke<any>('budget_get_period').catch(() => null);
    if (data) {
      const total = data.total_budget ?? 0;
      const spent = data.total_spent ?? 0;
      const pct = total > 0 ? (spent / total) * 100 : 0;
      if (pct > 100) {
        budgetStatus = `$${spent.toFixed(0)} spent of $${total.toFixed(0)} budget`;
        budgetPace = 'over';
      } else if (pct > 80) {
        budgetStatus = `$${(total - spent).toFixed(0)} left of $${total.toFixed(0)} budget`;
        budgetPace = 'on-track';
      } else {
        budgetStatus = `${(100 - pct).toFixed(0)}% of budget remaining`;
        budgetPace = 'under';
      }
    }
  } catch {}

  // Fetch dream streak
  let dreamStreak = 0;
  try {
    const { data } = await invoke<any>('dream_get_streak').catch(() => null);
    if (data) dreamStreak = data.streak ?? 0;
  } catch {}

  // Fetch weather (wttr.in — no API key needed)
  let weather = '';
  let weatherIcon = '';
  try {
    const res = await fetch('https://wttr.in/?format=%c%t&m').catch(() => null);
    if (res?.ok) {
      const text = await res.text();
      // format: "☀️ +62°F" or "🌤️ +58°F"
      const match = text.match(/^([^\s]+)\s+\+?([0-9]+)/);
      if (match) {
        weatherIcon = match[1].trim();
        weather = `${match[2].trim()}F`;
      }
    }
  } catch {}

  return {
    greeting,
    date: dateStr,
    tasksTop,
    tasksCount,
    budgetStatus,
    budgetPace,
    dreamStreak,
    weather,
    weatherIcon,
    nudgeCount: 0,
  };
}

// ── Overlay Component ───────────────────────────────────────────────────────────
interface MorningBriefOverlayProps {
  show: boolean;
  onDismiss: () => void;
}

export default function MorningBriefOverlay({ show, onDismiss }: MorningBriefOverlayProps) {
  const [briefData, setBriefData] = useState<MorningBriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fairyExpr, setFairyExpr] = useState<FairyExpression>('idle');

  useEffect(() => {
    if (!show) return;
    setLoading(true);
    playFairyChime();
    buildBriefData().then(data => {
      setBriefData(data);
      setLoading(false);
      setFairyExpr('listening');
      setTimeout(() => setFairyExpr('idle'), 3000);
    });
  }, [show]);

  const handleDismiss = () => {
    markBriefDismissed();
    onDismiss();
  };

  // Dismiss on Escape
  useEffect(() => {
    if (!show) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="morning-brief-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          onClick={handleDismiss}
        >
          {/* Radial gradient atmosphere */}
          <div className="morning-brief-atmosphere" />

          {/* Dismiss hint */}
          <motion.div
            className="morning-brief-dismiss-hint"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2, duration: 0.5 }}
          >
            Press <kbd>Esc</kbd> or click anywhere to continue
          </motion.div>

          {/* Main card */}
          <motion.div
            className="morning-brief-card"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 100, damping: 16 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header: greeting + fairy */}
            <div className="morning-brief-header">
              <div className="morning-brief-greeting">
                <div className="morning-brief-title">
                  {loading
                    ? 'Waking up...'
                    : briefData
                      ? `${briefData.greeting} ☀️`
                      : "You're all caught up"}
                </div>
                {!loading && briefData && (
                  <div className="morning-brief-date">{briefData.date}</div>
                )}
              </div>
              <div className="morning-brief-fairy">
                <ConfluxPresence
                  command={{
                    ...DEFAULT_COMMAND,
                    mode: 'idle',
                    label: 'Morning Brief',
                    glowBoost: 1.2,
                    pulseRate: 0.8,
                    palette: {
                      node: '#4a3f6b',
                      hot: '#7c6aad',
                      line: '#9d8cc7',
                      glow: '#c4b3e0',
                      aura: '#2a2040',
                    },
                  }}
                  pulseImpulse={0}
                  fairyExpression={fairyExpr}
                  style={{ width: 120, height: 120 }}
                />
              </div>
            </div>

            {/* Content grid */}
            {!loading && briefData && (
              <motion.div
                className="morning-brief-grid"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                {/* Tasks card */}
                <div className="morning-brief-section morning-brief-tasks">
                  <div className="morning-brief-section-icon">🧠</div>
                  <div className="morning-brief-section-label">Today's Missions</div>
                  {briefData.tasksCount === 0 ? (
                    <div className="morning-brief-empty">No pending tasks — enjoy the free space!</div>
                  ) : (
                    <>
                      <div className="morning-brief-count">{briefData.tasksCount} pending</div>
                      <ul className="morning-brief-task-list">
                        {briefData.tasksTop.map((task, i) => (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 + i * 0.08 }}
                          >
                            {task}
                          </motion.li>
                        ))}
                        {briefData.tasksCount > 3 && (
                          <li className="morning-brief-more">
                            +{briefData.tasksCount - 3} more
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </div>

                {/* Budget card */}
                <div className={`morning-brief-section morning-brief-budget morning-brief-budget-${briefData.budgetPace}`}>
                  <div className="morning-brief-section-icon">💚</div>
                  <div className="morning-brief-section-label">Pulse</div>
                  {briefData.budgetStatus ? (
                    <>
                      <div className="morning-brief-budget-text">{briefData.budgetStatus}</div>
                      <div className={`morning-brief-pace-indicator pace-${briefData.budgetPace}`}>
                        {briefData.budgetPace === 'over' ? '⚠️ Over pace' :
                          briefData.budgetPace === 'on-track' ? '✓ On track' : '✓ Frugal start'}
                      </div>
                    </>
                  ) : (
                    <div className="morning-brief-empty">No budget set — say "my budget is $500/month"</div>
                  )}
                </div>

                {/* Dreams streak */}
                <div className="morning-brief-section morning-brief-dreams">
                  <div className="morning-brief-section-icon">🎯</div>
                  <div className="morning-brief-section-label">Horizon Streak</div>
                  {briefData.dreamStreak > 0 ? (
                    <>
                      <div className="morning-brief-streak">
                        <span className="streak-number">{briefData.dreamStreak}</span>
                        <span className="streak-label">day streak</span>
                      </div>
                      <div className="morning-brief-streak-msg">
                        {briefData.dreamStreak >= 7
                          ? "Incredible consistency!"
                          : briefData.dreamStreak >= 3
                            ? "You're building momentum"
                            : "Keep it going!"}
                      </div>
                    </>
                  ) : (
                    <div className="morning-brief-empty">No active streak — add a goal to Horizon</div>
                  )}
                </div>

                {/* Weather */}
                {(briefData.weather || briefData.weatherIcon) && (
                  <div className="morning-brief-section morning-brief-weather">
                    <div className="morning-brief-section-icon">{briefData.weatherIcon}</div>
                    <div className="morning-brief-weather-temp">{briefData.weather}</div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Continue button */}
            <motion.button
              className="morning-brief-continue"
              onClick={handleDismiss}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Start your day →
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Hook for components to trigger the brief ──────────────────────────────────
export function useMorningBrief() {
  const [showBrief, setShowBrief] = useState(false);

  useEffect(() => {
    if (shouldShowBrief()) {
      // Small delay so it doesn't flash before the app is ready
      const t = setTimeout(() => setShowBrief(true), 800);
      markBriefShown();
      return () => clearTimeout(t);
    }
  }, []);

  return { showBrief, dismissBrief: () => setShowBrief(false) };
}
