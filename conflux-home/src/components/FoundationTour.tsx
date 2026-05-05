// Conflux Home — Foundation Guided Tour
// 4-step spotlight tour through the Foundation UI

import { useState, useEffect, useRef, useCallback } from 'react';
import TourSpotlight from './TourSpotlight';

const TOUR_DONE_KEY = 'foundation-tour-completed';

const TOUR_STEPS = [
  {
    id: 'hero',
    title: 'Your Home\'s Health Score',
    body: 'Foundation assigns a single score (0–100) to your home\'s overall health. Green means thriving. Red means act now. Tap any system to drill down.',
    target: '.foundation-hero',
  },
  {
    id: 'stats',
    title: 'The Vital Signs',
    body: 'Monthly utilities, overdue tasks, upcoming maintenance, and appliances at risk — all at a glance. These four numbers tell the full story.',
    target: '.foundation-stat-grid',
  },
  {
    id: 'diagnose',
    title: 'Describe Problems, Get Answers',
    body: 'Not sure why your AC is making that sound? Tell Foundation in plain language. It\'ll diagnose the likely cause and recommend what to do next.',
    target: '.foundation-diagnose-input',
  },
  {
    id: 'vault',
    title: 'Your Warranty Vault',
    body: "Store warranties, receipts, and contracts here. Foundation tracks expiration dates and reminds you before coverage expires. Never lose a warranty again.",
    target: '.foundation-vault-tab',
  },
];

export function hasCompletedFoundationTour(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true';
}

export function resetFoundationTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

interface FoundationTourProps {
  onComplete: () => void;
}

export default function FoundationTour({ onComplete }: FoundationTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isActive, setIsActive] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Find + track target element
  useEffect(() => {
    if (!isActive || !step) return;

    const updateRect = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(step.target);
          if (el) {
            setTargetRect(el.getBoundingClientRect());
          } else {
            setTargetRect(null);
          }
        });
      });
    };

    const timer = setTimeout(updateRect, 120);
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
    <div className="foundation-tour-root">
      <TourSpotlight targetRect={targetRect} padding={10} borderRadius={16} />

      <FoundationTourTooltip
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

function FoundationTourTooltip({ targetRect, step, currentStep, total, isLast, onNext, onSkip }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'bottom' as 'top' | 'bottom' });

  useEffect(() => {
    if (!ref.current || !targetRect) return;
    const tooltipEl = ref.current;
    const tooltipH = tooltipEl.offsetHeight;
    const tooltipW = tooltipEl.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;

    const spaceBelow = vh - targetRect.bottom - gap * 2;
    const spaceAbove = targetRect.top - gap * 2;
    const placement = spaceBelow >= tooltipH ? 'bottom' : spaceAbove >= tooltipH ? 'top' : 'bottom';

    let top = placement === 'bottom'
      ? targetRect.bottom + gap
      : targetRect.top - tooltipH - gap;
    top = Math.max(gap, Math.min(top, vh - tooltipH - gap));

    let left = targetRect.left + targetRect.width / 2 - tooltipW / 2;
    left = Math.max(gap, Math.min(left, vw - tooltipW - gap));

    setPos({ top, left, placement });
  }, [targetRect]);

  useEffect(() => {
    if (!targetRect && ref.current) {
      const el = ref.current;
      setPos({
        top: window.innerHeight / 2 - el.offsetHeight / 2 + 60,
        left: window.innerWidth / 2 - el.offsetWidth / 2,
        placement: 'bottom',
      });
    }
  }, [targetRect]);

  return (
    <div
      ref={ref}
      className={`foundation-tour-tooltip foundation-tour-tooltip--${pos.placement}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {targetRect && (
        <div
          className="foundation-tour-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - pos.left, 24),
              (ref.current?.offsetWidth ?? 300) - 24
            ),
          }}
        />
      )}

      <div className="foundation-tour-header">
        <span className="foundation-tour-step-label">
          Step {currentStep + 1} of {total}
        </span>
        <button className="foundation-tour-close" onClick={onSkip}>✕</button>
      </div>

      <div className="foundation-tour-dots">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`foundation-tour-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
          />
        ))}
      </div>

      <h3 className="foundation-tour-title">{step.title}</h3>
      <p className="foundation-tour-body">{step.body}</p>

      <div className="foundation-tour-footer">
        <button className="foundation-tour-skip" onClick={onSkip}>Skip tour</button>
        <button className="foundation-tour-next" onClick={onNext}>
          {isLast ? '✓ Enter Foundation' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
