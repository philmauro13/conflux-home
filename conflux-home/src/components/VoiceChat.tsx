// Conflux Home — Voice Chat for Young Agents
// Auto-speaking chat interface for toddlers and preschoolers.
// Big buttons, voice input, playful UI.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTTS } from '../hooks/useTTS';
import { useVoiceInput } from '../hooks/useVoiceInput';
import type { Agent } from '../types';

interface VoiceChatProps {
  agent: Agent;
  onSendMessage: (message: string) => Promise<string>; // returns agent response
  onClose: () => void;
}

export default function VoiceChat({ agent, onSendMessage, onClose }: VoiceChatProps) {
  const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSpokenRef = useRef(false);

  const { speak, stop, speaking, supported: ttsSupported } = useTTS();

  const handleVoiceTranscription = useCallback((text: string) => {
    if (text.trim() && !isProcessing) {
      handleSend(text);
    }
  }, [isProcessing]);

  const { isListening, isTranscribing, isAvailable, error, toggleListening, clearError } = useVoiceInput({
    onTranscription: handleVoiceTranscription,
  });

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-speak new agent messages
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === 'agent' && ttsSupported && !hasSpokenRef.current) {
      hasSpokenRef.current = true;
      // Strip markdown for cleaner speech
      const cleanText = lastMsg.text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s/g, '')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .trim();
      speak(cleanText, { rate: 0.9, pitch: 1.1 });
    }
  }, [messages, ttsSupported, speak]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isProcessing) return;
    const userMsg = text.trim();
    setInputText('');
    setIsProcessing(true);
    hasSpokenRef.current = false;

    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const response = await onSendMessage(userMsg);
      setMessages(prev => [...prev, { role: 'agent', text: response }]);
    } catch {
      setMessages(prev => [...prev, { role: 'agent', text: "Oops! Something went wrong. Let's try again! 😊" }]);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, onSendMessage]);

  const handleTextSubmit = useCallback(() => {
    if (inputText.trim()) {
      handleSend(inputText);
    }
  }, [inputText, handleSend]);

  // Quick reply buttons for common young-kid responses
  const quickReplies = ['Yes! 👍', 'No thanks', 'More please! 🎉', 'Tell me a story! 📖', "What's that? 🤔"];

  return (
    <div className="voice-chat-overlay">
      <div className="voice-chat">
        {/* Header */}
        <div className="voice-chat-header">
          <div className="voice-agent-info">
            <span className="voice-agent-emoji">{agent.emoji}</span>
            <div>
              <div className="voice-agent-name">{agent.name}</div>
              <div className="voice-agent-status">
                {speaking ? '🔊 Speaking...' : isListening ? '🎤 Listening...' : isTranscribing ? '⏳ Processing...' : '💬 Ready to chat!'}
              </div>
            </div>
          </div>
          <button className="voice-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="voice-error-banner" onClick={clearError}>
            ⚠️ {error} — tap to dismiss
          </div>
        )}

        {/* Messages */}
        <div className="voice-messages">
          {messages.length === 0 && (
            <div className="voice-welcome">
              <div className="voice-welcome-emoji">{agent.emoji}</div>
              <div className="voice-welcome-text">
                Hi there! I'm {agent.name}! Tap the big button to talk to me!
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`voice-message ${msg.role}`}>
              {msg.role === 'agent' && <span className="voice-msg-emoji">{agent.emoji}</span>}
              <div className="voice-msg-bubble">{msg.text}</div>
              {msg.role === 'agent' && ttsSupported && (
                <button
                  className="voice-replay-btn"
                  onClick={() => speak(msg.text, { rate: 0.9, pitch: 1.1 })}
                  title="Hear again"
                >
                  🔊
                </button>
              )}
            </div>
          ))}
          {isProcessing && (
            <div className="voice-message agent">
              <span className="voice-msg-emoji">{agent.emoji}</span>
              <div className="voice-msg-bubble typing">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}
          {isTranscribing && (
            <div className="voice-message user">
              <div className="voice-msg-bubble interim">⏳ Transcribing...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        {messages.length > 0 && !isProcessing && !isListening && (
          <div className="voice-quick-replies">
            {quickReplies.map(reply => (
              <button
                key={reply}
                className="voice-quick-btn"
                onClick={() => handleSend(reply)}
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="voice-controls">
          {/* Main Mic Button */}
          {isAvailable && (
            <button
              className={`voice-mic-btn ${isListening ? 'listening' : ''}`}
              onClick={toggleListening}
              disabled={isProcessing}
            >
              <span className="mic-icon">{isListening ? '🔴' : '🎤'}</span>
              <span className="mic-label">
                {isListening ? 'Tap to Stop' : 'Tap to Talk'}
              </span>
            </button>
          )}

          {/* Text Input Toggle */}
          <button
            className="voice-text-toggle"
            onClick={() => setShowTextInput(!showTextInput)}
          >
            ⌨️
          </button>

          {/* Stop Speaking */}
          {speaking && (
            <button className="voice-stop-btn" onClick={stop}>
              🔇 Stop
            </button>
          )}
        </div>

        {/* Text Input (optional) */}
        {showTextInput && (
          <div className="voice-text-input">
            <input
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
              placeholder="Type a message..."
              autoFocus
            />
            <button onClick={handleTextSubmit} disabled={!inputText.trim() || isProcessing}>
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
