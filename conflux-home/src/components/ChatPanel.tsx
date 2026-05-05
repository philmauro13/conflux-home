import { useState, useEffect, useRef, useCallback } from 'react';
import { marked } from 'marked';
import Avatar from './Avatar';
import SessionSidebar from './SessionSidebar';
import { Agent } from '../types';
import { useEngineChat } from '../hooks/useEngineChat';
import { useAuth } from '../hooks/useAuth';
import { MicButton } from './voice';
import { useConfluxController } from './conflux';
import { playMessageSent, playMessageReceived, soundManager } from '../lib/sound';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Simple XSS sanitizer: strip <script> tags and event handlers
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

interface ChatPanelProps {
  agent: Agent | null;
  agents: Agent[];
  isOpen: boolean;
  isExpanded: boolean;
  onClose: () => void;
  onSelectAgent: (agent: Agent) => void;
  onToggleExpand: () => void;
}

export default function ChatPanel({ agent, agents, isOpen, isExpanded, onClose, onSelectAgent, onToggleExpand }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  // Auth — pass user ID to engine for cloud credit tracking
  const { session } = useAuth();

  // Conflux Neural Controller (for visual sync)
  const conflux = useConfluxController({
    initialMode: 'idle',
    initialTransparent: true,
  });

  // Engine chat — handles personality, memory, sessions, tools, AND cloud credits
  const { messages, sendMessage, streaming, thinking, error, remainingCalls, credits, isQuotaExceeded, sessionId, loadSession, createNewSession } = useEngineChat(
    agent?.id ?? null,
    session?.user?.id
  );

  // Sync Conflux Neural State
  // 1. Thinking Mode (Focus)
  useEffect(() => {
    if (thinking) {
      conflux.setMode('focus', 'system', 'Thinking...');
    } else if (!streaming) {
      conflux.setMode('idle', 'system', 'Ready');
    }
  }, [thinking, streaming, conflux.setMode]);

  // 2. Streaming/Speaking Mode (Cadence
  useEffect(() => {
    if (streaming && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if ('role' in lastMessage && lastMessage.role === 'assistant') {
        // Simple token split simulation for visual pulse
        // In a real scenario, we'd tap into the actual stream tokens
        const tokens = lastMessage.content.split(/\s+/);
        conflux.runSpeechCadence({
          tokens: tokens.slice(-10), // Pulse with last 10 words for effect
          intervalMs: 100,
          strength: 10,
          burstsPerToken: 2,
        });
      }
    }
  }, [streaming, messages, conflux.runSpeechCadence]);

  // Reset input when agent changes
  useEffect(() => {
    setInput('');
  }, [agent?.id]);

  // Auto-scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, isOpen]);

  // Play sound when a new assistant message arrives
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.type === 'agent') {
        playMessageReceived();
      }
    }
    prevMsgCount.current = messages.length;
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming || !agent) return;
    const content = input;
    setInput('');
    playMessageSent();
    sendMessage(content);
  }, [input, streaming, agent, sendMessage]);

  // Play thinking ambient while agent is processing
  useEffect(() => {
    if (!thinking) return;
    const handle = soundManager.startThinkingAmbient();
    return () => handle.stop();
  }, [thinking]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownOpen && agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  if (!agent) {
    return (
      <div className={`chat-panel ${isOpen ? 'open' : ''} ${isExpanded ? 'chat-panel-expanded' : ''}`}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: 16, padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 48 }}>💬</div>
          <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>No Agent Selected</h3>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 280 }}>
            Install an agent from the Agent Library to start chatting.
          </p>
          <button
            onClick={() => {
              onClose();
              window.dispatchEvent(new CustomEvent('conflux:navigate', { detail: 'agents' }));
            }}
            style={{
              marginTop: 12, padding: '10px 24px', borderRadius: 10,
              background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)',
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Browse Agents →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`chat-panel ${isOpen ? 'open' : ''} ${isExpanded ? 'chat-panel-expanded' : ''}`}>
      {/* Session Sidebar */}
      <SessionSidebar
        agentId={agent?.id ?? null}
        activeSessionId={sessionId}
        onSelectSession={(sid) => {
          loadSession(sid);
          setSidebarOpen(false);
        }}
        onNewSession={async () => {
          try {
            const newSid = await createNewSession();
            await loadSession(newSid);
            setSidebarOpen(false);
          } catch (err) {
            console.error('[ChatPanel] createNewSession failed:', err);
          }
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Header */}
      <div className="chat-panel-header">
        <Avatar
          agentId={agent.id}
          name={agent.name}
          emoji={agent.emoji}
          status={agent.status}
          size="sm"
          showStatus={true}
        />
        {/* Agent name with dropdown */}
        <div className="chat-panel-header-info" ref={agentDropdownRef} style={{ position: 'relative' }}>
          <div
            className="chat-panel-header-name"
            onClick={() => agents.length > 1 && setDropdownOpen(!dropdownOpen)}
            style={{ cursor: agents.length > 1 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {agent.name}
            {agents.length > 1 && (
              <span style={{ fontSize: 10, opacity: 0.6, transition: 'transform 0.15s', transform: dropdownOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
            )}
          </div>
          <div className="chat-panel-header-role">{agent.role}</div>
          {/* Agent dropdown */}
          {dropdownOpen && agents.length > 1 && (
            <div className="chat-agent-dropdown">
              {agents.map((a) => (
                <button
                  key={a.id}
                  className={`chat-agent-dropdown-item ${a.id === agent.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelectAgent(a);
                    setDropdownOpen(false);
                  }}
                >
                  <Avatar agentId={a.id} name={a.name} emoji={a.emoji} status={a.status} size="sm" showStatus={false} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{a.role}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* History button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: sidebarOpen ? 'var(--accent-primary)' : 'rgba(255,255,255,0.08)',
            border: 'none',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 14,
            cursor: 'pointer',
            color: sidebarOpen ? '#000' : 'var(--text-muted)',
          }}
          title="Conversation history"
        >
          🕐
        </button>
        {/* Credits badge */}
        <div className="chat-credits-badge">
          {isQuotaExceeded
            ? '🔒 Limit reached'
            : `⚡ ${credits.toLocaleString()}`}
        </div>
        <button className="chat-panel-close" onClick={onClose} aria-label="Close chat">
          ✕
        </button>
      </div>

      {/* Messages or empty state */}
      {messages.length === 0 ? (
        <div className="chat-panel-empty">
          <Avatar
            agentId={agent.id}
            name={agent.name}
            emoji={agent.emoji}
            status={agent.status}
            size="hero"
            showStatus={true}
          />
          <div className="chat-panel-empty-text">
            Start a conversation with {agent.name}
          </div>
          <div className="chat-panel-empty-sub">
            {agent.description}
          </div>
        </div>
      ) : (
        <div className="chat-panel-messages">
          {messages.map((msg) => {
            const isAgent = msg.type === 'agent';
            const renderedContent = isAgent
              ? sanitize(marked.parse(msg.content) as string)
              : undefined;

            return (
              <div key={msg.id} className={`chat-message ${msg.type}`}>
                {isAgent && (
                  <div style={{
                    fontSize: 11,
                    color: 'var(--accent-primary)',
                    marginBottom: 4,
                    fontWeight: 600,
                  }}>
                    {agent.emoji} {agent.name}
                  </div>
                )}
                {isAgent ? (
                  <span
                    className="chat-message-html"
                    dangerouslySetInnerHTML={{ __html: renderedContent! }}
                  />
                ) : (
                  msg.content
                )}
                {isAgent && msg.model && (
                  <span style={{
                    display: 'inline-block',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 4,
                    padding: '1px 6px',
                    marginTop: 4,
                    opacity: 0.7,
                  }}>
                    {msg.model}
                  </span>
                )}
                <div style={{
                  fontSize: 10,
                  color: msg.type === 'user' ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)',
                  marginTop: 4,
                  textAlign: msg.type === 'user' ? 'right' : 'left',
                }}>
                  {msg.timestamp}
                </div>
              </div>
            );
          })}

          {/* Thinking indicator */}
          {(thinking || streaming) && (
            <div className="thinking-indicator">
              <div className="thinking-dot" />
              <div className="thinking-dot" />
              <div className="thinking-dot" />
            </div>
          )}

          {/* Error display */}
          {error && !thinking && !streaming && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(255, 68, 68, 0.1)',
              border: '1px solid rgba(255, 68, 68, 0.3)',
              color: '#ff6666',
              fontSize: 12,
              marginTop: 8,
            }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <div className="chat-panel-input-area">
        {/* Top row: full width input + send */}
        <div className="chat-input-row">
          <input
            className="chat-panel-input"
            placeholder={`Message ${agent.name}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={streaming}
          />
          <button
            className="chat-panel-send"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
          >
            {streaming ? '···' : '↑'}
          </button>
        </div>
        {/* Bottom bar: expand + mic + model info */}
        <div className="chat-input-toolbar">
          <button
            className="chat-expand-btn"
            onClick={onToggleExpand}
            title={isExpanded ? 'Shrink' : 'Expand'}
          >
            {isExpanded ? '↙' : '↗'}
          </button>
          <MicButton
            variant="inline"
            size="sm"
            onTranscription={(text) => setInput(prev => prev + text)}
          />
        </div>
      </div>
    </div>
  );
}
