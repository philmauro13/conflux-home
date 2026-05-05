// Conflux Home — Echo Guided Tour
// 4-step spotlight tour through the Echo wellness companion UI

import { useState, useEffect, useRef, useCallback } from 'react';
import TourSpotlight from './TourSpotlight';

const TOUR_DONE_KEY = 'echo-tour-completed';

const TOUR_STEPS = [
  {
    id: 'session',
    title: 'Your Session Space',
    body: 'This is where you talk to Echo — without judgment, without a timer. Say anything. Echo reads between the lines and responds with warmth.',
    target: '.echo-counselor-chat',
  },
  {
    id: 'journal',
    title: "Echo's Private Journal",
    body: "After each session, Echo writes private reflections about your time together — patterns noticed, things worth revisiting, growth observed.",
    target: '.echo-counselor-journal-entries',
  },
  {
    id: 'tools',
    title: 'Wellness Tools',
    body: 'Quick practices to return to center: gratitude exercises, grounding techniques, and a gentle evening ritual to close the day.',
    target: '.echo-counselor-tools-section',
  },
  {
    id: 'letter',
    title: 'Your Weekly Letter',
    body: "Once a week, Echo writes you a personal letter — a summary of your sessions, the themes that emerged, and a word for the week ahead.",
    target: '.echo-letter-view',
  },
];

export function hasCompletedEchoTour(): boolean {
  return localStorage.getItem(TOUR_DONE_KEY) === 'true';
}

export function resetEchoTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

interface EchoTourProps {
  onComplete: () => void;
}

export default function EchoTour({ onComplete }: EchoTourProps) {
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
    <div className="echo-tour-root">
      <TourSpotlight targetRect={targetRect} padding={10} borderRadius={16} />

      <EchoTourTooltip
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

// ── Echo Tour Tooltip ─────────────────────────────────────

interface TooltipProps {
  targetRect: DOMRect | null;
  step: typeof TOUR_STEPS[0];
  currentStep: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onSkip: () => void;
}

function EchoTourTooltip({ targetRect, step, currentStep, total, isLast, onNext, onSkip }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, placement: 'bottom' as 'top' | 'bottom' });

  useEffect(() => {
    if (!ref.current || !targetRect) return;
    const el = ref.current;
    const tooltipH = el.offsetHeight;
    const tooltipW = el.offsetWidth;
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
      className={`echo-tour-tooltip echo-tour-tooltip--${pos.placement}`}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 10000 }}
    >
      {targetRect && (
        <div
          className="echo-tour-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - pos.left, 24),
              (ref.current?.offsetWidth ?? 300) - 24
            ),
          }}
        />
      )}

      <div className="echo-tour-header">
        <span className="echo-tour-step-label">Step {currentStep + 1} of {total}</span>
        <button className="echo-tour-close" onClick={onSkip}>✕</button>
      </div>

      <div className="echo-tour-dots">
        {TOUR_STEPS.map((_, i) => (
          <div
            key={i}
            className={`echo-tour-dot ${i === currentStep ? 'active' : i < currentStep ? 'done' : ''}`}
          />
        ))}
      </div>

      <h3 className="echo-tour-title">{step.title}</h3>
      <p className="echo-tour-body">{step.body}</p>

      <div className="echo-tour-footer">
        <button className="echo-tour-skip" onClick={onSkip}>Skip tour</button>
        <button className="echo-tour-next" onClick={onNext}>
          {isLast ? '✓ Begin' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
