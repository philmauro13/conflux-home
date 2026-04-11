import React, { useState, useRef, useEffect } from 'react';
import type { HomeChatMessage } from '../../types';

interface FoundationChatProps {
  messages: HomeChatMessage[];
  onSend: (msg: string) => void;
  loading?: boolean;
}

const FoundationChat: React.FC<FoundationChatProps> = ({ messages, onSend, loading }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="foundation-chat-area" style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 400,
    }}>
      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '12px 4px', display: 'flex',
        flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.45)', fontSize: 14,
          }}>
            🏠 Ask me anything about your home — maintenance, costs, repairs, or upgrades.
          </div>
        ) : (
          messages.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
              }}>
                <div className={isUser ? 'foundation-chat-bubble-user' : 'foundation-chat-bubble'} style={{
                  maxWidth: '80%', padding: '10px 14px', borderRadius: 14,
                  borderBottomRightRadius: isUser ? 4 : 14,
                  borderBottomLeftRadius: isUser ? 14 : 4,
                  background: isUser ? 'rgba(100,116,139,0.25)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isUser ? 'rgba(100,116,139,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  fontSize: 13, lineHeight: 1.5, color: isUser ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.8)',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            );
          })
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '10px 14px', borderRadius: 14, borderBottomLeftRadius: 4,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13, color: 'rgba(255,255,255,0.45)',
            }}>
              <span style={{ animation: 'foundation-pulse 1.5s infinite' }}>thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: 8, padding: '12px 0 4px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <input
          className="foundation-chat-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your home..."
          disabled={loading}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#fff', fontSize: 13, outline: 'none',
            transition: 'border-color 0.2s',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: '10px 16px', borderRadius: 10,
            background: input.trim() && !loading ? '#64748b' : 'rgba(255,255,255,0.06)',
            border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s',
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default FoundationChat;
