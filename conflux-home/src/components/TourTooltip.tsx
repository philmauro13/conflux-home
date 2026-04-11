import { useEffect, useRef, useState } from 'react';

interface TourTooltipProps {
  targetRect: DOMRect | null;
  title: string;
  text: string;
  step: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  isLast?: boolean;
  isFirst?: boolean;
}

export default function TourTooltip({
  targetRect,
  title,
  text,
  step,
  total,
  onNext,
  onSkip,
  isLast = false,
  isFirst = false,
}: TourTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: 'bottom',
  });

  useEffect(() => {
    if (!tooltipRef.current) return;

    const tooltip = tooltipRef.current;
    const tooltipRect = tooltip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 16;

    if (!targetRect) {
      // Center on screen
      setPosition({
        top: Math.max(gap, vh / 2 - tooltipRect.height / 2 + 80),
        left: Math.max(gap, vw / 2 - tooltipRect.width / 2),
        placement: 'bottom',
      });
      return;
    }

    // Decide top vs bottom
    const spaceBelow = vh - targetRect.bottom - gap * 2;
    const spaceAbove = targetRect.top - gap * 2;
    const placement = spaceBelow >= tooltipRect.height ? 'bottom' : spaceAbove >= tooltipRect.height ? 'top' : 'bottom';

    let top = placement === 'bottom'
      ? targetRect.bottom + gap
      : targetRect.top - tooltipRect.height - gap;

    // Clamp vertical to viewport
    top = Math.max(gap, Math.min(top, vh - tooltipRect.height - gap));

    // Horizontal: center on target, clamp to viewport
    let left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(gap, Math.min(left, vw - tooltipRect.width - gap));

    setPosition({ top, left, placement });
  }, [targetRect]);

  return (
    <div
      ref={tooltipRef}
      className={`tour-tooltip tour-tooltip--${position.placement}`}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 10000,
      }}
    >
      {/* Arrow */}
      {targetRect && (
        <div
          className="tour-tooltip-arrow"
          style={{
            left: Math.min(
              Math.max(targetRect.left + targetRect.width / 2 - position.left, 20),
              (tooltipRef.current?.getBoundingClientRect().width ?? 300) - 20
            ),
          }}
        />
      )}

      {/* Content */}
      <div className="tour-tooltip-content">
        <h3 className="tour-tooltip-title">{title}</h3>
        <p className="tour-tooltip-text">{text}</p>
      </div>

      {/* Footer */}
      <div className="tour-tooltip-footer">
        <span className="tour-tooltip-progress">{step + 1} / {total}</span>
        <div className="tour-tooltip-actions">
          <button className="tour-tooltip-skip" onClick={onSkip}>
            Skip tour
          </button>
          <button className="tour-tooltip-next" onClick={onNext}>
            {isLast ? "Enter Conflux Home" : isFirst ? "Let's Go" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
