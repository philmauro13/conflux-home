import { useEffect, useState, useRef } from 'react';
import Avatar from './Avatar';
import { AGENT_PROFILE_MAP } from '../data/agent-descriptions';
import { NeuralBrainScene } from './NeuralBrainScene';
import { DEFAULT_COMMAND } from '../lib/neuralBrain';

interface WelcomeOverlayProps {
  userName: string;
  selectedAgentIds: string[];
  onComplete: () => void;
}

export default function WelcomeOverlay({
  userName,
  selectedAgentIds,
  onComplete,
}: WelcomeOverlayProps) {
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<'entering' | 'visible' | 'dismissing'>('entering');
  const dismissRef = useRef(false);

  // Phase-based lifecycle for smoother transitions
  useEffect(() => {
    if (phase === 'entering') {
      const t = setTimeout(() => setPhase('visible'), 400);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const handleDismiss = () => {
    if (dismissRef.current) return;
    dismissRef.current = true;
    setPhase('dismissing');
    localStorage.setItem('conflux-welcomed', 'true');
    setTimeout(onComplete, 350); // slightly longer for smooth fade-out
  };

  // Auto-dismiss after 12s (give them time to enjoy the team reveal)
  useEffect(() => {
    const timer = setTimeout(handleDismiss, 12000);
    return () => clearTimeout(timer);
  }, []);

  // Resolve agents from IDs
  const agents = selectedAgentIds
    .map((id) => AGENT_PROFILE_MAP[id])
    .filter(Boolean);

  const displayName = userName?.trim() || 'there';

  return (
    <>
      <style>{`
        /* ===== Overlay ===== */
        .welcome-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          pointer-events: auto;
        }

        .welcome-overlay.phase-entering {
          animation: welcome-overlay-fadein 400ms ease-out forwards;
        }
        .welcome-overlay.phase-visible {
          opacity: 1;
        }
        .welcome-overlay.phase-dismissing {
          animation: welcome-overlay-fadeout 350ms ease-in forwards;
          pointer-events: none;
        }

        @keyframes welcome-overlay-fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes welcome-overlay-fadeout {
          from { opacity: 1; }
          to { opacity: 0; }
        }

        /* ===== Neural Brain Background ===== */
        .welcome-brain-bg {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 600px;
          height: 600px;
          opacity: 0.12;
          pointer-events: none;
          animation: welcome-brain-breathe 4s ease-in-out infinite;
        }

        @keyframes welcome-brain-breathe {
          0%, 100% { opacity: 0.10; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.16; transform: translate(-50%, -50%) scale(1.03); }
        }

        /* ===== Card ===== */
        .welcome-card {
          position: relative;
          background: var(--bg-card, #ffffff);
          border-radius: 24px;
          padding: 48px 40px 40px;
          max-width: 540px;
          width: 90vw;
          text-align: center;
          box-shadow:
            0 8px 32px rgba(0,0,0,0.12),
            0 0 0 1px rgba(255,255,255,0.08),
            0 0 80px rgba(0, 113, 227, 0.06);
          animation: welcome-card-scalein 500ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
        }

        @keyframes welcome-card-scalein {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(16px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* ===== Conflux avatar ===== */
        .welcome-conflux-avatar {
          display: flex;
          justify-content: center;
          margin-bottom: 24px;
          animation: welcome-avatar-pop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 400ms both;
        }

        @keyframes welcome-avatar-pop {
          from {
            opacity: 0;
            transform: scale(0.6) rotate(-8deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        /* ===== Text ===== */
        .welcome-greeting {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary, #1d1d1f);
          margin-bottom: 8px;
          line-height: 1.3;
          letter-spacing: -0.3px;
          animation: welcome-text-fadein 400ms ease-out 600ms both;
        }

        .welcome-subtext {
          font-size: 15px;
          color: var(--text-secondary, #6e6e73);
          margin-bottom: 32px;
          line-height: 1.6;
          animation: welcome-text-fadein 400ms ease-out 800ms both;
        }

        @keyframes welcome-text-fadein {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* ===== "Meet Your Team" label ===== */
        .welcome-team-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--text-muted, #8e8e93);
          margin-bottom: 16px;
          animation: welcome-text-fadein 400ms ease-out 1000ms both;
        }

        /* ===== Agent row ===== */
        .welcome-agents-row {
          display: flex;
          justify-content: center;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 36px;
          min-height: 72px;
        }

        .welcome-agent-slot {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          opacity: 0;
          animation: welcome-agent-fadein 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes welcome-agent-fadein {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.85);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .welcome-agent-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary, #6e6e73);
          max-width: 76px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ===== Button ===== */
        .welcome-cta {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 36px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(135deg, var(--accent-primary, #0071e3), #005bb5);
          color: #fff;
          font-size: 17px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.2px;
          transition:
            transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
            box-shadow 0.2s ease,
            filter 0.2s ease;
          box-shadow:
            0 4px 16px rgba(0, 113, 227, 0.3),
            0 0 0 0 rgba(0, 113, 227, 0);
          opacity: 0;
          animation: welcome-btn-fadein 300ms ease-out forwards;
          position: relative;
          overflow: hidden;
        }

        .welcome-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .welcome-cta:hover {
          transform: translateY(-2px) scale(1.02);
          box-shadow:
            0 6px 24px rgba(0, 113, 227, 0.4),
            0 0 0 3px rgba(0, 113, 227, 0.15);
          filter: brightness(1.05);
        }

        .welcome-cta:hover::before {
          opacity: 1;
        }

        .welcome-cta:active {
          transform: translateY(0) scale(0.98);
          box-shadow: 0 2px 8px rgba(0, 113, 227, 0.3);
          transition-duration: 0.08s;
        }

        .welcome-cta-arrow {
          display: inline-block;
          transition: transform 0.2s ease;
        }

        .welcome-cta:hover .welcome-cta-arrow {
          transform: translateX(3px);
        }

        @keyframes welcome-btn-fadein {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Click-outside overlay to dismiss */}
      <div
        className={`welcome-overlay phase-${phase}`}
        onClick={handleDismiss}
      >
        {/* Neural brain pulse in background */}
        <div className="welcome-brain-bg">
          <NeuralBrainScene
            command={DEFAULT_COMMAND}
            pulseImpulse={4}
            transparent={true}

          />
        </div>

        <div
          className="welcome-card"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Conflux avatar */}
          <div className="welcome-conflux-avatar">
            <Avatar
              agentId="conflux"
              name="Conflux"
              emoji="🤖"
              status="idle"
              size="lg"
              showStatus={false}
            />
          </div>

          {/* Greeting text */}
          <div className="welcome-greeting">
            Hey {displayName}! I'm Conflux, your strategic partner.
          </div>
          <div className="welcome-subtext">
            Your team is ready. Let's build something incredible.
          </div>

          {/* "Meet Your Team" label */}
          <div className="welcome-team-label">
            Meet Your Team
          </div>

          {/* Agent avatars staggered */}
          <div className="welcome-agents-row">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                className="welcome-agent-slot"
                style={{
                  animationDelay: `${1200 + i * 200}ms`,
                }}
              >
                <Avatar
                  agentId={agent.id}
                  name={agent.name}
                  emoji={agent.emoji}
                  status="idle"
                  size="sm"
                  showStatus={false}
                />
                <span className="welcome-agent-name">{agent.name}</span>
              </div>
            ))}
          </div>

          {/* CTA button — delay after all agents */}
          <button
            className="welcome-cta"
            style={{
              animationDelay: `${1200 + agents.length * 200 + 200}ms`,
            }}
            onClick={handleDismiss}
          >
            Enter Conflux Home <span className="welcome-cta-arrow">→</span>
          </button>
        </div>
      </div>
    </>
  );
}
