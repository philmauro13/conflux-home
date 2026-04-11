import React, { useState, useRef, useCallback } from 'react';
import type { RippleSignal } from '../types';

interface SignalCardProps {
  signal: RippleSignal;
  onSave?: (signal: RippleSignal) => void;
  onDismiss?: (signal: RippleSignal) => void;
  onExpand?: (signal: RippleSignal) => void;
}

function getColorClass(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('budget') || cat.includes('money') || cat.includes('finance')) return 'emerald';
  if (cat.includes('dream') || cat.includes('goal') || cat.includes('aspir')) return 'amber';
  if (cat.includes('creative') || cat.includes('design') || cat.includes('art')) return 'violet';
  return 'cyan';
}

function getCategoryEmoji(category: string): string {
  const cat = category.toLowerCase();
  if (cat.includes('budget') || cat.includes('money')) return '💰';
  if (cat.includes('dream') || cat.includes('goal')) return '🎯';
  if (cat.includes('creative') || cat.includes('design')) return '🎨';
  if (cat.includes('news')) return '📰';
  if (cat.includes('tech')) return '⚡';
  return '📡';
}

export default function SignalCard({ signal, onSave, onDismiss, onExpand }: SignalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [swipeState, setSwipeState] = useState<'idle' | 'swiping-right' | 'swiping-left' | 'saved' | 'dismissed'>('idle');
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const currentXRef = useRef<number>(0);
  const isDraggingRef = useRef(false);

  const colorClass = getColorClass(signal.category);
  const emoji = getCategoryEmoji(signal.category);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.touches[0].clientX;
    currentXRef.current = e.touches[0].clientX;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.touches[0].clientX;
    const diff = currentXRef.current - startXRef.current;
    const threshold = 50;

    if (diff > threshold) {
      setSwipeState('swiping-right');
    } else if (diff < -threshold) {
      setSwipeState('swiping-left');
    } else {
      setSwipeState('idle');
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const diff = currentXRef.current - startXRef.current;
    const threshold = 80;

    if (diff > threshold && onSave) {
      setSwipeState('saved');
      onSave(signal);
      setTimeout(() => setSwipeState('idle'), 500);
    } else if (diff < -threshold && onDismiss) {
      setSwipeState('dismissed');
      onDismiss(signal);
      setTimeout(() => setSwipeState('idle'), 500);
    } else {
      setSwipeState('idle');
    }
  }, [signal, onSave, onDismiss]);

  // Mouse-based swipe (for desktop)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    currentXRef.current = e.clientX;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    currentXRef.current = e.clientX;
    const diff = currentXRef.current - startXRef.current;
    const threshold = 50;

    if (diff > threshold) {
      setSwipeState('swiping-right');
    } else if (diff < -threshold) {
      setSwipeState('swiping-left');
    } else {
      setSwipeState('idle');
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const diff = currentXRef.current - startXRef.current;
    const threshold = 80;

    if (diff > threshold && onSave) {
      setSwipeState('saved');
      onSave(signal);
      setTimeout(() => setSwipeState('idle'), 500);
    } else if (diff < -threshold && onDismiss) {
      setSwipeState('dismissed');
      onDismiss(signal);
      setTimeout(() => setSwipeState('idle'), 500);
    } else {
      setSwipeState('idle');
    }
  }, [signal, onSave, onDismiss]);

  const handleMouseLeave = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setSwipeState('idle');
    }
  }, []);

  const confidencePercent = signal.confidence;
  const confidenceColor =
    confidencePercent >= 75 ? 'var(--radar-emerald)' :
    confidencePercent >= 50 ? 'var(--radar-amber)' : '#ef4444';

  return (
    <div className="signal-card-container">
      <div
        ref={cardRef}
        className={`signal-card ${swipeState === 'swiping-right' ? 'swiping-right' : ''} ${swipeState === 'swiping-left' ? 'swiping-left' : ''}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: swipeState === 'swiping-right'
            ? 'translateX(40px) rotate(2deg)'
            : swipeState === 'swiping-left'
            ? 'translateX(-40px) rotate(-2deg)'
            : 'translateX(0) rotate(0)',
          transition: isDraggingRef.current ? 'none' : 'transform 0.3s ease',
        }}
      >
        {/* Category badge */}
        <span className={`signal-category-badge signal-category-${colorClass}`}>
          {emoji} {signal.category}
        </span>

        {/* Title */}
        <h3 className="signal-title">{signal.title}</h3>

        {/* Body */}
        <p className="signal-body">{signal.description}</p>

        {/* Confidence meter */}
        <div className="signal-confidence">
          <span>Confidence</span>
          <div className="signal-confidence-bar">
            <div
              className="signal-confidence-fill"
              style={{
                width: `${confidencePercent}%`,
                background: confidenceColor,
              }}
            />
          </div>
          <span>{confidencePercent}%</span>
        </div>

        {/* Action buttons */}
        <div className="signal-actions">
          {onSave && (
            <button className="signal-action-btn save" onClick={() => onSave(signal)}>
              ✓ Save
            </button>
          )}
          {onDismiss && (
            <button className="signal-action-btn dismiss" onClick={() => onDismiss(signal)}>
              ✕ Dismiss
            </button>
          )}
          <button
            className="signal-action-btn expand"
            onClick={() => {
              setExpanded(!expanded);
              onExpand?.(signal);
            }}
          >
            {expanded ? '▾ Less' : '▸ More'}
          </button>
        </div>

        {/* Expanded detail */}
        {expanded && (
          <div className="signal-expanded-detail">
            <h4>Why It Matters</h4>
            <p>{signal.why_it_could_matter}</p>
          </div>
        )}
      </div>

      {/* Swipe hint indicators */}
      <span className="signal-swipe-hint left">← Dismiss</span>
      <span className="signal-swipe-hint right">Save →</span>
    </div>
  );
}
