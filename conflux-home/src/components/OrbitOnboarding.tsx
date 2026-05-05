// Conflux Home — Orbit Onboarding (Mission Briefing)
// Orbit introduces itself through 4 feature panels.
// No user data required — just an interactive tour.
//
// LocalStorage: 'orbit-onboarding-completed' (permanent — one time only)
//
// Design: CRT cockpit aesthetic, blue-on-dark,
//         interactive feature cards with scan-reveal animation,
//         progress bar, keyboard navigable

import { useState, useEffect, useCallback } from 'react';
import '../styles/orbit-boot.css';

const ONBOARDING_DONE_KEY = 'orbit-onboarding-completed';

const FEATURES = [
  {
    id: 'tasks',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    label: 'TASKS',
    title: 'Every mission starts with a list.',
    body: 'Add tasks by typing naturally — "dentist friday 2pm" or "buy groceries tomorrow." Orbit categorizes, prioritizes, and schedules automatically.',
    stat: null,
    accent: '#3b82f6',
  },
  {
    id: 'habits',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
    label: 'HABITS',
    title: 'Track what you do, not just what you plan.',
    body: 'Daily habits with a heatmap. See your streaks, spot patterns, and Orbit nudges you when consistency slips.',
    stat: '🔥 Keep the streak alive',
    accent: '#10b981',
  },
  {
    id: 'briefing',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="10 8 16 12 10 16 10 8" />
      </svg>
    ),
    label: 'BRIEFING',
    title: "Your morning intelligence report.",
    body: "Every day, Orbit generates a briefing: what's due, what habits to keep, what energy to expect. Like a mission debrief before launch.",
    stat: '⏰ Generated each morning',
    accent: '#f59e0b',
  },
  {
    id: 'reschedule',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    ),
    label: 'RESCHEDULE',
    title: "Orbit finds the right time.",
    body: "Missed a task? Orbit analyzes your calendar, energy patterns, and deadlines — then suggests the perfect moment to reschedule.",
    stat: '🧠 AI-powered timing',
    accent: '#8b5cf6',
  },
];

interface Props {
  onComplete: () => void;
}

export function hasCompletedOrbitOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

export default function OrbitOnboarding({ onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entered, setEntered] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);

  // Entry animation
  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 100);
    const t2 = setTimeout(() => setCardVisible(true), 400);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleNext();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < FEATURES.length - 1) {
      setCardVisible(false);
      setTimeout(() => {
        setCurrentIndex(c => c + 1);
        setCardVisible(true);
      }, 200);
    } else {
      // Done
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      onComplete();
    }
  }, [currentIndex, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCardVisible(false);
      setTimeout(() => {
        setCurrentIndex(c => c - 1);
        setCardVisible(true);
      }, 200);
    }
  }, [currentIndex]);

  const current = FEATURES[currentIndex];
  const isLast = currentIndex === FEATURES.length - 1;
  const progress = ((currentIndex + 1) / FEATURES.length) * 100;

  return (
    <div className={`orbit-onboard-root ${entered ? 'entered' : ''}`}>

      {/* Header */}
      <div className="orbit-onboard-header">
        <div className="orbit-onboard-logo">ORBIT</div>
        <div className="orbit-onboard-label">MISSION BRIEFING</div>
      </div>

      {/* Mission briefing card */}
      <div className={`orbit-onboard-card ${cardVisible ? 'visible' : ''}`}
        style={{ '--accent': current.accent } as React.CSSProperties}
      >
        {/* Scan line on card */}
        <div className="orbit-onboard-card-scan" />

        {/* Feature icon + label */}
        <div className="orbit-onboard-feature-header">
          <div className="orbit-onboard-icon" style={{ color: current.accent }}>
            {current.icon}
          </div>
          <div className="orbit-onboard-feature-label" style={{ color: current.accent }}>
            {current.label}
          </div>
        </div>

        {/* Title */}
        <h2 className="orbit-onboard-title">{current.title}</h2>

        {/* Body */}
        <p className="orbit-onboard-body">{current.body}</p>

        {/* Stat badge */}
        {current.stat && (
          <div className="orbit-onboard-stat" style={{ borderColor: current.accent, color: current.accent }}>
            {current.stat}
          </div>
        )}

        {/* Navigation dots */}
        <div className="orbit-onboard-dots">
          {FEATURES.map((_, i) => (
            <div
              key={i}
              className={`orbit-onboard-dot ${i === currentIndex ? 'active' : i < currentIndex ? 'done' : ''}`}
              onClick={() => {
                if (i !== currentIndex) {
                  setCardVisible(false);
                  setTimeout(() => { setCurrentIndex(i); setCardVisible(true); }, 200);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Navigation controls */}
      <div className="orbit-onboard-controls">
        {/* Back */}
        <button
          className="orbit-onboard-btn orbit-onboard-back"
          onClick={currentIndex === 0 ? undefined : handlePrev}
          disabled={currentIndex === 0}
        >
          ← BACK
        </button>

        {/* Progress bar */}
        <div className="orbit-onboard-progress-track">
          <div
            className="orbit-onboard-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Next / Launch */}
        <button
          className="orbit-onboard-btn orbit-onboard-next"
          onClick={handleNext}
        >
          {isLast ? '🚀 LAUNCH ORBIT' : 'NEXT →'}
        </button>
      </div>

      {/* Keyboard hint */}
      <div className="orbit-onboard-hint">
        ← → to navigate · Enter to continue
      </div>
    </div>
  );
}
