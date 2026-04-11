import { useState, useEffect, useCallback } from 'react';
import { AGENT_PROFILE_MAP } from '../data/agent-descriptions';
import Avatar from './Avatar';
import { useAgentManager } from '../hooks/useAgentManager';

// ─── Unified Agent Data ────────────────────────────────────────

interface AgentDetailData {
  id: string;
  name: string;
  emoji: string;
  role: string;
  tagline: string;
  description: string;
  personality: string;
  skills: string[];
  bestFor: string[];
  avatarPath: string;
  color: string;
  isCore: boolean;
  comingSoon: boolean;
}

function resolveAgent(agentId: string): AgentDetailData | null {
  const profile = AGENT_PROFILE_MAP[agentId];
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    emoji: profile.emoji,
    role: profile.role,
    tagline: profile.tagline,
    description: profile.description,
    personality: profile.personality,
    skills: profile.skills,
    bestFor: profile.bestFor,
    avatarPath: profile.avatarPath,
    color: profile.color,
    isCore: !profile.comingSoon,
    comingSoon: profile.comingSoon ?? false,
  };
}

// ─── Component ─────────────────────────────────────────────────

export default function AgentDetail({ agentId: propAgentId }: { agentId?: string } = {}) {
  const [agentId, setAgentId] = useState<string | null>(propAgentId ?? null);
  const [animating, setAnimating] = useState(false);
  const [closing, setClosing] = useState(false);
  const { isInstalled, install, uninstall } = useAgentManager();
  const [busy, setBusy] = useState(false);

  const agent = agentId ? resolveAgent(agentId) : null;

  // Listen for conflux:agent-detail event
  useEffect(() => {
    if (propAgentId) return; // prop mode, skip event listener
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.agentId) {
        setAgentId(detail.agentId);
        setAnimating(true);
        setClosing(false);
      }
    };
    window.addEventListener('conflux:agent-detail', handler);
    return () => window.removeEventListener('conflux:agent-detail', handler);
  }, [propAgentId]);

  // When propAgentId changes externally
  useEffect(() => {
    if (propAgentId) {
      setAgentId(propAgentId);
      setAnimating(true);
      setClosing(false);
    }
  }, [propAgentId]);

  // Escape key handler
  useEffect(() => {
    if (!agentId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [agentId]);

  // Mount animation
  useEffect(() => {
    if (animating) {
      const timer = setTimeout(() => setAnimating(false), 200);
      return () => clearTimeout(timer);
    }
  }, [animating]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setAgentId(null);
      setClosing(false);
    }, 200);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!agentId || busy) return;
    setBusy(true);
    await install(agentId);
    setBusy(false);
  }, [agentId, busy, install]);

  const handleUninstall = useCallback(async () => {
    if (!agentId || busy) return;
    setBusy(true);
    await uninstall(agentId);
    setBusy(false);
  }, [agentId, busy, uninstall]);

  const handleChat = useCallback(() => {
    if (!agentId) return;
    window.dispatchEvent(new CustomEvent('conflux:open-chat', { detail: { agentId } }));
    handleClose();
  }, [agentId, handleClose]);

  // Don't render if no agent
  if (!agentId) return null;

  // Data not found
  if (!agent) return null;

  const installed = isInstalled(agent.id);

  // ── Styles ──
  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    opacity: closing ? 0 : 1,
    transition: 'opacity 200ms ease',
  };

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    overflowY: 'auto',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.4)',
    padding: '32px 28px',
    position: 'relative',
    transform: closing ? 'scale(0.95)' : 'scale(1)',
    opacity: closing ? 0 : 1,
    transition: 'transform 200ms ease, opacity 200ms ease',
    ...(animating && !closing
      ? {
          animation: 'agent-detail-enter 200ms ease-out forwards',
        }
      : {}),
  };

  const dividerStyle: React.CSSProperties = {
    width: '100%',
    height: 1,
    background: 'rgba(255,255,255,0.1)',
    margin: '20px 0',
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  };

  return (
    <>
      <style>{`
        @keyframes agent-detail-enter {
          from {
            transform: scale(0.95);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      <div style={backdropStyle} onClick={handleClose}>
        <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
          {/* Close button */}
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              width: 32,
              height: 32,
              borderRadius: 16,
              border: 'none',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 18,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, color 0.15s',
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLButtonElement).style.background = 'var(--bg-secondary)';
              (e.target as HTMLButtonElement).style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLButtonElement).style.background = 'var(--bg-primary)';
              (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)';
            }}
          >
            ✕
          </button>

          {/* Hero avatar */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Avatar
              agentId={agent.id}
              name={agent.name}
              emoji={agent.emoji}
              status="idle"
              size="hero"
              showStatus={false}
            />
          </div>

          {/* Name & role */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {agent.name}
            </h2>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
              {agent.role}
            </div>
          </div>

          {/* Badges */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 12,
                background: `${agent.color}18`,
                color: agent.color,
                textTransform: 'capitalize',
              }}
            >
              {agent.isCore ? 'Core Agent' : 'Expert'}
            </span>
            {agent.comingSoon && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: 'rgba(123, 47, 255, 0.15)',
                  color: 'var(--accent-secondary)',
                }}
              >
                🔒 Coming Soon
              </span>
            )}
            {installed && !agent.comingSoon && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 12,
                  background: 'rgba(0, 255, 136, 0.12)',
                  color: '#00ff88',
                }}
              >
                ✓ Installed
              </span>
            )}
          </div>

          {/* About */}
          <div style={dividerStyle} />
          <div style={sectionLabel}>About</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text-primary)', margin: 0 }}>
            {agent.description}
          </p>

          {/* Personality */}
          <div style={dividerStyle} />
          <div style={sectionLabel}>🧠 How They Work</div>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
            {agent.personality}
          </p>

          {/* Skills */}
          <div style={dividerStyle} />
          <div style={sectionLabel}>Skills</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {agent.skills.map((skill) => (
              <span
                key={skill}
                style={{
                  fontSize: 12,
                  padding: '5px 12px',
                  borderRadius: 16,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.75)',
                  fontWeight: 500,
                }}
              >
                {skill}
              </span>
            ))}
          </div>

          {/* Best For */}
          <div style={dividerStyle} />
          <div style={sectionLabel}>Best For</div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 13,
              color: 'rgba(255,255,255,0.75)',
              lineHeight: 1.8,
            }}
          >
            {agent.bestFor.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          {/* Action button */}
          <div style={{ marginTop: 24 }}>
            {agent.comingSoon ? (
              <div style={{ textAlign: 'center' }}>
                <button
                  disabled
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'not-allowed',
                    opacity: 0.5,
                  }}
                >
                  🔒 Coming Soon
                </button>
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.6)',
                  }}
                >
                  Want this agent?{' '}
                  <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    style={{
                      color: 'var(--accent-secondary)',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >
                    Notify Me
                  </a>
                </div>
              </div>
            ) : installed ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={handleChat}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: 14,
                    border: 'none',
                    background: agent.color,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  💬 Click to Chat
                </button>
                <button
                  onClick={handleUninstall}
                  disabled={busy}
                  style={{
                    width: '100%',
                    padding: '10px 24px',
                    borderRadius: 14,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.75)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {busy ? 'Uninstalling...' : 'Uninstall Agent'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                disabled={busy}
                style={{
                  width: '100%',
                  padding: '14px 24px',
                  borderRadius: 14,
                  border: `2px solid ${agent.color}`,
                  background: `${agent.color}15`,
                  color: agent.color,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {busy ? 'Installing...' : '+ Install Agent'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
