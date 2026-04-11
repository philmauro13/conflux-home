// Cooking Mode Enhanced — Voice-first, Full-screen Cooking Experience
// Big typography, progress dots, timer integration, ambient sounds, auto-advance

import { useState, useEffect, useCallback } from 'react';
import { CookingStep } from '../types';

interface Props {
  steps: CookingStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  autoAdvance?: boolean;
}

interface TimerState {
  remaining: number; // seconds
  isRunning: boolean;
}

export default function CookingModeEnhanced({
  steps,
  currentStep,
  onNext,
  onPrev,
  onClose,
  autoAdvance = false,
}: Props) {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [ambientPlaying, setAmbientPlaying] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  if (steps.length === 0) return null;
  const step = steps[currentStep];

  // Timer countdown
  useEffect(() => {
    if (!timer || !timer.isRunning || timer.remaining <= 0) return;

    const interval = setInterval(() => {
      setTimer(prev => {
        if (!prev || prev.remaining <= 0) return prev;
        const next = prev.remaining - 1;
        if (next === 0) {
          // Timer complete — could play sound here
          return { ...prev, remaining: 0, isRunning: false };
        }
        return { ...prev, remaining: next };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [timer]);

  // Auto-start timer if step has duration
  useEffect(() => {
    if (step?.duration_minutes && autoAdvance) {
      setTimer({
        remaining: step.duration_minutes * 60,
        isRunning: true,
      });
    }
  }, [currentStep, step?.duration_minutes, autoAdvance]);

  const handleTimerToggle = useCallback(() => {
    setTimer(prev => {
      if (!prev) return null;
      return { ...prev, isRunning: !prev.isRunning };
    });
  }, []);

  const handleTimerReset = useCallback(() => {
    if (step?.duration_minutes) {
      setTimer({
        remaining: step.duration_minutes * 60,
        isRunning: false,
      });
    }
  }, [step?.duration_minutes]);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleVoiceToggle = useCallback(() => {
    setVoiceEnabled(prev => !prev);
    // TODO: Toggle TTS playback
  }, []);

  const handleAmbientToggle = useCallback(() => {
    setAmbientPlaying(prev => !prev);
    // TODO: Play/pause ambient kitchen sounds
  }, []);

  const progressPercent = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="cooking-enhanced-overlay">
      <div className="cooking-enhanced">
        {/* Progress Bar */}
        <div className="cooking-progress-bar">
          <div
            className="cooking-progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Header */}
        <div className="cooking-enhanced-header">
          <div className="cooking-step-indicator">
            Step {currentStep + 1} of {steps.length}
          </div>
          <div className="cooking-controls">
            <button
              className={`cooking-control-btn ${voiceEnabled ? 'active' : ''}`}
              onClick={handleVoiceToggle}
              title="Toggle voice guidance"
            >
              {voiceEnabled ? '🔊' : '🔇'}
            </button>
            <button
              className={`cooking-control-btn ${ambientPlaying ? 'active' : ''}`}
              onClick={handleAmbientToggle}
              title="Toggle ambient sounds"
            >
              {ambientPlaying ? '🎵' : '🔇'}
            </button>
            <button className="cooking-close-btn" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Progress Dots */}
        <div className="cooking-progress-dots">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`cooking-dot ${
                i === currentStep ? 'current' : i < currentStep ? 'completed' : 'upcoming'
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="cooking-step-content">
          <div className="cooking-step-number-large">
            {currentStep + 1}
          </div>
          <p className="cooking-step-instruction-large">
            {step.instruction}
          </p>

          {/* Timer Section */}
          {step.duration_minutes && (
            <div className="cooking-timer-section">
              <div className="cooking-timer-display">
                <span className="cooking-timer-icon">⏱️</span>
                <span className="cooking-timer-value">
                  {formatTime(timer?.remaining ?? step.duration_minutes * 60)}
                </span>
              </div>
              <div className="cooking-timer-controls">
                <button
                  className="cooking-timer-btn"
                  onClick={handleTimerToggle}
                >
                  {timer?.isRunning ? '⏸️ Pause' : '▶️ Start'}
                </button>
                <button
                  className="cooking-timer-btn"
                  onClick={handleTimerReset}
                >
                  🔄 Reset
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="cooking-enhanced-nav">
          <button
            className="cooking-nav-btn-large"
            onClick={onPrev}
            disabled={currentStep === 0}
          >
            ← Previous
          </button>
          <div className="cooking-step-counter">
            {currentStep + 1} / {steps.length}
          </div>
          <button
            className="cooking-nav-btn-large primary"
            onClick={onNext}
            disabled={currentStep === steps.length - 1}
          >
            {currentStep === steps.length - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
