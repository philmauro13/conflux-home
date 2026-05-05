// Conflux Home — Hearth Guided Tour
// 4-step spotlight tour through the Hearth (Kitchen) UI

import { useState, useEffect, useRef, useCallback } from 'react';
import TourSpotlight from './TourSpotlight';

const TOUR_DONE_KEY = 'hearth-tour-completed';

const TOUR_STEPS = [
  {
    id: 'restaurant',
    title: "Today's Menu",
    body: "This is what Hearth knows you can cook right now — your favorites and the chef's suggestions. Tap any dish to start cooking.",
    target: '.restaurant-menu',
  },
  {
    id: 'nudges',
    title: 'Smart Nudges',
    body: "Hearth watches your kitchen and gives gentle nudges — 'use that chicken before it expires,' or 'you're low on groceries for this week's plan.'",
    target: '.kitchen-nudges',
  },
  {
    id: 'library',
    title: 'Your Recipe Library',
    body: "Every meal you add lives here. Tell Hearth 'I made pasta carbonara' and it saves the recipe, tracks ingredients, and calculates cost per serving.",
    target: '.kitchen-library',
  },
  {
    id: 'week-plan',
    title: 'Plan Your Week',
    body: "Drag meals into breakfast, lunch, and dinner slots. Hearth calculates your total food budget and generates a grocery list automatically.",
    target: '.kitchen-plan',
  },
];

export function hasCompletedHearthTour(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true';
}

export function resetHearthTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

interface HearthTourProps {
  onComplete: () => void;
}

export default function HearthTour({ onComplete }: HearthTourProps) {
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
    <div className="hearth-tour-root">
      <TourSpotlight targetRect={targetRect} padding={10} borderRadius={16} />
      <HearthTourTooltip
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

// ── Tour Tooltip ──────────────────────────────────────────────

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

function HearthTourTooltip({ targetRect, step, currentStep, total, isLast, isFirst, onNext, onSkip }: TooltipProps) {
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
      className={`hearth-tour-tooltip hearth-tour-tooltip--${pos.placement}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {targetRect && (
        <div
          className="hearth-tour-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - pos.left, 24),
              (ref.current?.getBoundingClientRect().width ?? 300) - 24
            ),
          }}
        />
      )}

      <div className="hearth-tour-header">
        <span className="hearth-tour-step-label">Step {currentStep + 1} of {total}</span>
        <button className="hearth-tour-close" onClick={onSkip} aria-label="Close tour">✕</button>
      </div>

      <div className="hearth-tour-progress">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`hearth-tour-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
          />
        ))}
      </div>

      <h3 className="hearth-tour-title">{step.title}</h3>
      <p className="hearth-tour-body">{step.body}</p>

      <div className="hearth-tour-footer">
        <button className="hearth-tour-skip" onClick={onSkip}>Skip tour</button>
        <button className="hearth-tour-next" onClick={onNext}>
          {isLast ? '🔥 Start cooking →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
