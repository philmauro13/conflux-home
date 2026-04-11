import { useEffect, useState, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import '../styles/morning-brief.css';

// Configure marked (same as ChatPanel)
marked.setOptions({ breaks: true, gfm: true });

// Simple XSS sanitizer
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

interface EngineSession {
  id: string;
  agent_id: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface EngineMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

interface MorningBriefProps {
  onDismiss: () => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MorningBrief({ onDismiss }: MorningBriefProps) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const dismissRef = useRef(false);

  const handleDismiss = useCallback(() => {
    if (dismissRef.current) return;
    dismissRef.current = true;
    setDismissed(true);
    setTimeout(onDismiss, 200);
  }, [onDismiss]);

  useEffect(() => {
    let cancelled = false;

    async function fetchBrief() {
      try {
        const sessions = await invoke<EngineSession[]>('engine_get_sessions', { limit: 20 });

        // Find a morning-brief cron session — look for title or agent matching "morning" or "brief"
        const briefSession = sessions.find(
          (s) =>
            s.agent_id === 'conflux' ||
            s.agent_id === 'morning-brief'
        );

        if (!briefSession || cancelled) {
          if (!cancelled) handleDismiss();
          return;
        }

        const messages = await invoke<EngineMessage[]>('engine_get_messages', {
          sessionId: briefSession.id,
          limit: 10,
        });

        // Get the last assistant message
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');

        if (!lastAssistant || cancelled) {
          if (!cancelled) handleDismiss();
          return;
        }

        if (!cancelled) {
          setBrief(lastAssistant.content);
          setLoading(false);
        }
      } catch {
        if (!cancelled) handleDismiss();
      }
    }

    fetchBrief();

    // Auto-dismiss after 30 seconds
    const timer = setTimeout(handleDismiss, 30000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [handleDismiss]);

  const renderedBrief = brief ? sanitize(marked.parse(brief) as string) : '';

  return (
    <div
      className={`morning-brief-overlay ${dismissed ? 'morning-brief-dismissing' : 'morning-brief-entering'}`}
      onClick={handleDismiss}
    >
      <div
        className="morning-brief-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sun icon */}
        <div className="morning-brief-sun">☀️</div>

        {/* Greeting */}
        <div className="morning-brief-greeting">{getGreeting()}!</div>

        {/* Subtitle */}
        <div className="morning-brief-subtitle">Here's your daily briefing</div>

        {/* Content */}
        <div className="morning-brief-content-wrap">
          {loading ? (
            <div className="morning-brief-loading">
              <div className="morning-brief-spinner" />
              <span>Preparing your briefing…</span>
            </div>
          ) : (
            <div
              className="morning-brief-content"
              dangerouslySetInnerHTML={{ __html: renderedBrief }}
            />
          )}
        </div>

        {/* CTA */}
        <button
          className="morning-brief-cta"
          onClick={handleDismiss}
        >
          Start my day →
        </button>
      </div>
    </div>
  );
}
