import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { classifyIntent, type IntentResult } from '../hooks/useIntentRouter';
import { playClick, playNavSwish } from '../lib/sound';
import '../styles-global-ai-input.css';

interface GlobalAIInputProps {
  userId: string;
  onRoute: (intent: IntentResult) => void;
  onOpenChat?: (message?: string) => void;
}

export default function GlobalAIInput({ userId, onRoute, onOpenChat }: GlobalAIInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        setShowDropdown(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen || !showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 50);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, showDropdown]);

  // Show intent preview as user types
  const intent = inputValue.length > 2 ? classifyIntent(inputValue) : null;

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    playClick();
    setIsProcessing(true);
    setShowDropdown(false);

    const detected = classifyIntent(inputValue.trim());

    // If intent maps to a specific app, route there with pre-built prompt
    if (detected.type !== 'chat' && detected.confidence > 0.2) {
      detected.prompt = detected.prompt || inputValue.trim();
      onRoute(detected);
      setIsOpen(false);
      setInputValue('');
      setIsProcessing(false);
      return;
    }

    // Fallback: open chat with the message
    if (onOpenChat) {
      onOpenChat(inputValue.trim());
    } else {
      onRoute({ type: 'chat', view: 'chat', confidence: 1.0, agentId: 'conflux' });
    }

    setIsOpen(false);
    setInputValue('');
    setIsProcessing(false);
  }, [inputValue, isProcessing, onRoute, onOpenChat]);

  const handleToggle = useCallback(() => {
    playClick();
    setIsOpen(prev => !prev);
    if (isOpen) {
      setInputValue('');
      setShowDropdown(false);
    }
  }, [isOpen]);

  return (
    <div className="global-ai-input-wrapper" ref={containerRef}>
      {!isOpen ? (
        <button className="global-ai-input-trigger" onClick={handleToggle}>
          <span className="global-ai-input-icon">✨</span>
          <span className="global-ai-input-placeholder">Ask anything...</span>
        </button>
      ) : (
        <form className="global-ai-input-form" onSubmit={handleSubmit}>
          <div className="global-ai-input-inner">
            <span className="global-ai-input-icon-active">✨</span>
            <input
              ref={inputRef}
              type="text"
              className="global-ai-input-field"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Ask your AI team anything..."
              disabled={isProcessing}
            />
            {isProcessing && (
              <span className="global-ai-input-spinner">⏳</span>
            )}
            {!isProcessing && inputValue && (
              <button type="submit" className="global-ai-input-send">
                →
              </button>
            )}
          </div>

          {/* Intent preview dropdown */}
          {showDropdown && intent && inputValue.length > 2 && (
            <div className="global-ai-intent-preview">
              <span className="intent-agent-badge">
                {intent.agentId === 'pulse' ? '💰' :
                 intent.agentId === 'hearth' ? '🍳' :
                 intent.agentId === 'horizon' ? '🏔️' :
                 intent.agentId === 'orbit' ? '🪐' :
                 intent.agentId === 'foundation' ? '🔧' :
                 intent.agentId === 'current' ? '📰' :
                 '🤖'}{' '}
                {intent.agentId === 'pulse' ? 'Pulse' :
                 intent.agentId === 'hearth' ? 'Hearth' :
                 intent.agentId === 'horizon' ? 'Horizon' :
                 intent.agentId === 'orbit' ? 'Orbit' :
                 intent.agentId === 'foundation' ? 'Foundation' :
                 intent.agentId === 'current' ? 'Current' :
                 'Conflux'}
              </span>
              <span className="intent-type-label">
                {intent.type === 'budget' ? 'Budget question' :
                 intent.type === 'kitchen' ? 'Kitchen/M meal' :
                 intent.type === 'dreams' ? 'Goal planning' :
                 intent.type === 'life' ? 'Life/task management' :
                 intent.type === 'home' ? 'Home maintenance' :
                 intent.type === 'feed' ? 'News/briefing' :
                 'General chat'}
              </span>
              {Math.round(intent.confidence * 100) > 50 && (
                <span className="intent-confidence">
                  {Math.round(intent.confidence * 100)}% match
                </span>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
