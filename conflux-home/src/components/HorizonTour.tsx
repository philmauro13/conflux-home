// Conflux Home — Horizon Guided Tour
// Stellar Navigation tour: 4 steps through the constellation UI

import { useState, useEffect, useRef, useCallback } from 'react';
import TourSpotlight from './TourSpotlight';

const TOUR_DONE_KEY = 'horizon-tour-completed';

const TOUR_STEPS = [
  {
    id: 'header',
    title: 'Your Constellation',
    body: 'Every dream is a constellation. Track your active dreams, milestones completed, and the pace you\'re moving at. The sky gets brighter as you progress.',
    target: '.stellar-header',
  },
  {
    id: 'map',
    title: 'Chart the Stars',
    body: 'Each star in your constellation is a milestone. Click any star to expand it — add tasks, check them off, and watch your constellation grow brighter.',
    target: '.stellar-map',
  },
  {
    id: 'mission',
    title: 'The Mission Log',
    body: "This is where your AI companion narrates your journey. Hit 'Narrate' to hear your progress in your own voice — and get guidance for what comes next.",
    target: '.mission-log',
  },
  {
    id: 'velocity',
    title: 'Your Velocity',
    body: 'Track how fast you\'re moving toward your dreams. Are you ahead, on track, or drifting? Horizon adjusts your path so you don\'t fall behind.',
    target: '.orbital-velocity',
  },
];

export function hasCompletedHorizonTour(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true';
}

export function resetHorizonTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

interface HorizonTourProps {
  onComplete: () => void;
}

export default function HorizonTour({ onComplete }: HorizonTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isActive, setIsActive] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Track target rect with double-RAF timing
  useEffect(() => {
    if (!isActive || !step) return;

    const updateRect = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(step.target);
          setTargetRect(el?.getBoundingClientRect() ?? null);
        });
      });
    };

    const timer = setTimeout(updateRect, 100);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [currentStep, step, isActive]);

  // Keyboard navigation
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsActive(false); onComplete(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, currentStep]);

  const handleNext = useCallback(() => {
    if (isLast) {
      setIsActive(false);
      localStorage.setItem(TOUR_DONE_KEY, 'true');
      onComplete();
    } else {
      setCurrentStep(s => s + 1);
    }
  }, [isLast, onComplete]);

  const handleSkip = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(TOUR_DONE_KEY, 'true');
    onComplete();
  }, [onComplete]);

  if (!isActive) return null;

  return (
    <div className="horizon-tour-root">
      {/* SVG spotlight cutout */}
      <TourSpotlight targetRect={targetRect} padding={10} borderRadius={16} />

      {/* Tour tooltip */}
      <HorizonTourTooltip
        targetRect={targetRect}
        step={step}
        currentStep={currentStep}
        total={TOUR_STEPS.length}
        isLast={isLast}
        isFirst={currentStep === 0}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </div>
  );
}

// ── Horizon Tour Tooltip ──────────────────────────────────────────

interface TooltipProps {
  targetRect: DOMRect | null;
  step: typeof TOUR_STEPS[0];
  currentStep: number;
  total: number;
  isLast: boolean;
  isFirst: boolean;
  onNext: () => void;
  onSkip: () => void;
}

function HorizonTourTooltip({ targetRect, step, currentStep, total, isLast, isFirst, onNext, onSkip }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'bottom' as 'top' | 'bottom' });

  useEffect(() => {
    if (!ref.current || !targetRect) return;

    const tooltip = ref.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;

    const spaceBelow = vh - targetRect.bottom - gap * 2;
    const spaceAbove = targetRect.top - gap * 2;
    const placement = spaceBelow >= tooltipRect.height ? 'bottom' : spaceAbove >= tooltipRect.height ? 'top' : 'bottom';

    let top = placement === 'bottom'
      ? targetRect.bottom + gap
      : targetRect.top - tooltipRect.height - gap;
    top = Math.max(gap, Math.min(top, vh - tooltipRect.height - gap));

    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(gap, Math.min(left, vw - tooltipRect.width - gap));

    setPos({ top, left, placement });
  }, [targetRect]);

  // Fallback centered position when no target
  useEffect(() => {
    if (!targetRect && ref.current) {
      const tooltip = ref.current.getBoundingClientRect();
      setPos({
        top: window.innerHeight / 2 - tooltip.height / 2 + 80,
        left: window.innerWidth / 2 - tooltip.width / 2,
        placement: 'bottom',
      });
    }
  }, [targetRect]);

  return (
    <div
      ref={ref}
      className={`horizon-tour-tooltip horizon-tour-tooltip--${pos.placement}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {/* Arrow */}
      {targetRect && (
        <div
          className="horizon-tour-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - pos.left, 24),
              (ref.current?.getBoundingClientRect().width ?? 300) - 24
            ),
          }}
        />
      )}

      {/* Header */}
      <div className="horizon-tour-header">
        <span className="horizon-tour-step-label">Step {currentStep + 1} of {total}</span>
        <button className="horizon-tour-close" onClick={onSkip} aria-label="Close tour">✕</button>
      </div>

      {/* Progress dots */}
      <div className="horizon-tour-progress">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`horizon-tour-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
          />
        ))}
      </div>

      <h3 className="horizon-tour-title">{step.title}</h3>
      <p className="horizon-tour-body">{step.body}</p>

      <div className="horizon-tour-footer">
        <button className="horizon-tour-skip" onClick={onSkip}>Skip tour</button>
        <button className="horizon-tour-next" onClick={onNext}>
          {isLast ? 'Launch into your dreams →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
