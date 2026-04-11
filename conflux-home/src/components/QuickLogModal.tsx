import React, { useState, useEffect, useRef } from 'react';

interface QuickLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParseInput: (input: string) => Promise<void>;
}

export function QuickLogModal({ isOpen, onClose, onParseInput }: QuickLogModalProps) {
  const [input, setInput] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!input.trim() || isParsing) return;
    
    setIsParsing(true);
    try {
      await onParseInput(input.trim());
      setInput('');
      onClose();
    } catch (error) {
      console.error('Parse error:', error);
    } finally {
      setIsParsing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mc-modal-overlay" onClick={onClose}>
      <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mc-modal-header">
          <h3 className="mc-modal-title">⚡ Quick Log</h3>
          <button className="mc-modal-close" onClick={onClose}>✕</button>
        </div>
        
        <input
          ref={inputRef}
          type="text"
          className="mc-modal-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='e.g., "Call dentist tomorrow at 3pm" or "Gym workout high energy"'
          autoFocus
        />
        
        <div style={{ 
          marginTop: '16px', 
          fontSize: '12px', 
          color: 'var(--mc-text-muted)',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>Press Enter to log, Esc to close</span>
          <span>{isParsing ? 'Parsing...' : ''}</span>
        </div>
      </div>
    </div>
  );
}