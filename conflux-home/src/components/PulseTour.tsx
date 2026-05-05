// Conflux Home — Budget Tour (Pulse)
// 4-step spotlight tour through the Pulse financial cockpit UI

import { useState, useEffect, useRef, useCallback } from 'react';
import TourSpotlight from './TourSpotlight';

const TOUR_DONE_KEY = 'pulse-tour-completed';

const TOUR_STEPS = [
  {
    id: 'cockpit',
    title: 'Your Financial Cockpit',
    body: 'Income, obligations, and projected surplus — all in one glance. Pulse updates this in real-time as you log payments.',
    target: '.budget-cockpit',
  },
  {
    id: 'buckets',
    title: 'Every Dollar Has a Job',
    body: 'Each bucket is a spending category with a monthly target. Pulse divides that across your pay periods so you always know what to set aside.',
    target: '.matrix-container',
  },
  {
    id: 'log',
    title: 'Log Payments Instantly',
    body: "Click LOG PAYMENT to record a transaction. Select a bucket, enter the amount, confirm — Pulse updates the grid instantly.",
    target: '.btn-primary',
  },
  {
    id: 'nav',
    title: 'Navigate Your Budget',
    body: 'Use the period arrows to step through pay periods. Each column shows allocated vs. actually paid — see where you stand.',
    target: '.matrix-nav',
  },
];

export function hasCompletedPulseTour(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true';
}

export function resetPulseTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

interface PulseTourProps {
  onComplete: () => void;
}

export default function PulseTour({ onComplete }: PulseTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isActive, setIsActive] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

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
    <div className="pulse-tour-root">
      <TourSpotlight targetRect={targetRect} padding={10} borderRadius={16} />
      <PulseTourTooltip
        targetRect={targetRect}
        step={step}
        currentStep={currentStep}
        total={TOUR_STEPS.length}
        isLast={isLast}
        onNext={handleNext}
        onSkip={handleSkip}
      />
    </div>
  );
}

// ── Tour Tooltip ──────────────────────────────────────────────

interface TooltipProps {
  targetRect: DOMRect | null;
  step: typeof TOUR_STEPS[0];
  currentStep: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}

function PulseTourTooltip({ targetRect, step, currentStep, total, isLast, onNext, onSkip }: TooltipProps) {
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
      className={`pulse-tour-tooltip pulse-tour-tooltip--${pos.placement}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {targetRect && (
        <div
          className="pulse-tour-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - pos.left, 24),
              (ref.current?.getBoundingClientRect().width ?? 300) - 24
            ),
          }}
        />
      )}

      <div className="pulse-tour-header">
        <span className="pulse-tour-step-label">Step {currentStep + 1} of {total}</span>
        <button className="pulse-tour-close" onClick={onSkip} aria-label="Close tour">✕</button>
      </div>

      <div className="pulse-tour-progress">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`pulse-tour-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
          />
        ))}
      </div>

      <h3 className="pulse-tour-title">{step.title}</h3>
      <p className="pulse-tour-body">{step.body}</p>

      <div className="pulse-tour-footer">
        <button className="pulse-tour-skip" onClick={onSkip}>Skip tour</button>
        <button className="pulse-tour-next" onClick={onNext}>
          {isLast ? '💚 Start budgeting →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
