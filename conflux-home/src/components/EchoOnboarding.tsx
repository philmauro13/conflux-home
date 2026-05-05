// Conflux Home — Echo Onboarding
// One warm screen: "I'm not a therapist. I'm not a bot. I'm here."
// Immediately starts the first session.
//
// LocalStorage: 'echo-onboarding-completed' (permanent)

import { useState, useCallback } from 'react';
import { useEchoCounselor } from '../hooks/useEchoCounselor';
import type { EchoCounselorSession } from '../types';
import '../styles-echo-onboarding.css';

const ONBOARDING_DONE_KEY = 'echo-onboarding-completed';

export function hasCompletedEchoOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

interface EchoOnboardingProps {
  onComplete: (createdSession?: EchoCounselorSession) => void;
  onStartSession: () => void; // tell parent to start session immediately
}

export default function EchoOnboarding({ onComplete, onStartSession }: EchoOnboardingProps) {
  const { startSession, getOpening } = useEchoCounselor();
  const [isStarting, setIsStarting] = useState(false);

  const handleBegin = useCallback(async () => {
    setIsStarting(true);
    try {
      // Start the first session
      const session = await startSession();
      // Mark onboarding as done
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      // Brief pause for the session to initialize
      await new Promise(r => setTimeout(r, 400));
      onStartSession(); // tell EchoView to show the session
      onComplete(session ?? undefined); // pass the created session to parent
    } catch (e) {
      console.error('Failed to start session:', e);
      // Still complete even if session fails
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      onStartSession();
      onComplete();
    }
  }, [startSession, onStartSession, onComplete]);

  return (
    <div className="echo-onboard-root">
      {/* Ambient ember particles */}
      <div className="echo-onboard-particles" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={`echo-onboard-particle echo-onboard-particle-${i + 1}`} />
        ))}
      </div>

      {/* Background gradient */}
      <div className="echo-onboard-bg" aria-hidden="true" />

      {/* Card */}
      <div className="echo-onboard-card">
        {/* Orb */}
        <div className="echo-onboard-orb-wrap">
          <div className="echo-onboard-orb" />
          <div className="echo-onboard-orb-ring echo-onboard-orb-ring-1" />
          <div className="echo-onboard-orb-ring echo-onboard-orb-ring-2" />
        </div>

        {/* Title */}
        <h1 className="echo-onboard-title">
          <span className="echo-onboard-title-echo">ECHO</span>
        </h1>
        <p className="echo-onboard-subtitle">Your reflective wellness companion</p>

        {/* What Echo Is */}
        <div className="echo-onboard-manifesto">
          {[
            {
              emoji: '🤗',
              title: 'I\'m not a therapist.',
              desc: "I'm a presence. A warm, private space to think out loud.",
            },
            {
              emoji: '🔒',
              title: "I'm completely private.",
              desc: "What you say here stays here. You're safe to be honest.",
            },
            {
              emoji: '💜',
              title: "I'm always here.",
              desc: "No timer. No agenda. No judgment. Just show up.",
            },
          ].map(item => (
            <div key={item.title} className="echo-onboard-pillar">
              <span className="echo-onboard-pillar-emoji">{item.emoji}</span>
              <div className="echo-onboard-pillar-content">
                <span className="echo-onboard-pillar-title">{item.title}</span>
                <span className="echo-onboard-pillar-desc">{item.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Crisis note */}
        <div className="echo-onboard-crisis-note">
          <span className="echo-onboard-crisis-icon">💜</span>
          <span>
            If you're in crisis, Echo will notice and guide you to real support.
          </span>
        </div>

        {/* CTA */}
        <button
          className="echo-onboard-begin"
          onClick={handleBegin}
          disabled={isStarting}
        >
          {isStarting ? (
            <span className="echo-onboard-starting">
              <span className="echo-onboard-spinner" />
              Starting your space...
            </span>
          ) : (
            <>
              <span>Begin</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
