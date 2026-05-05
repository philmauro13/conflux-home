// Conflux Home — Session Sidebar
// Shows recent conversations, allows resuming or starting new ones.

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface EngineSession {
  id: string;
  agent_id: string;
  title: string | null;
  message_count: number;
  total_tokens: number;
  created_at: string;
  updated_at: string;
}

interface SessionSidebarProps {
  agentId: string | null;
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => Promise<void>; // actually creates a new session
  isOpen: boolean;
  onClose: () => void;
}

export default function SessionSidebar({
  agentId,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
  onClose,
}: SessionSidebarProps) {
  const [sessions, setSessions] = useState<EngineSession[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const all = await invoke<EngineSession[]>('engine_get_sessions', { limit: 50 });
      // Filter to sessions for this agent
      setSessions(all.filter(s => s.agent_id === agentId));
    } catch (err) {
      console.error('[SessionSidebar] Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    if (isOpen && agentId) {
      loadSessions();
    }
  }, [isOpen, agentId, loadSessions]);

  // Auto-refresh when active session changes (new messages)
  useEffect(() => {
    if (isOpen && agentId) {
      loadSessions();
    }
  }, [activeSessionId, isOpen, agentId, loadSessions]);

  function formatRelativeTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function truncateTitle(session: EngineSession): string {
    if (session.title) return session.title;
    return `${session.message_count} messages`;
  }

  if (!isOpen) return null;

  return (
    <div className="session-sidebar">
      <div className="session-sidebar-header">
        <span style={{ fontWeight: 600, fontSize: 13 }}>History</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={async () => {
              try {
                await onNewSession();
                // Reload sessions list after creating
                await loadSessions();
              } catch (err) {
                console.error('[SessionSidebar] Failed to create new session:', err);
              }
            }}
            style={{
              background: 'var(--accent-primary)',
              color: '#000',
              border: 'none',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            + New
          </button>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="session-sidebar-list">
        {loading && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Loading...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No conversations yet
          </div>
        )}

        {sessions.map(session => (
          <div
            key={session.id}
            className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => onSelectSession(session.id)}
          >
            <div className="session-item-title">{truncateTitle(session)}</div>
            <div className="session-item-meta">
              <span>{session.message_count} msgs</span>
              <span>·</span>
              <span>{formatRelativeTime(session.updated_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
