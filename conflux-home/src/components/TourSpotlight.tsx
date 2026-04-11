import { useEffect, useState } from 'react';

interface TourSpotlightProps {
  targetRect: DOMRect | null;
  padding?: number;
  borderRadius?: number;
}

export default function TourSpotlight({ targetRect, padding = 8, borderRadius = 12 }: TourSpotlightProps) {
  const [adjustedRect, setAdjustedRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (targetRect) {
      // Allow time for DOM to settle
      const timer = requestAnimationFrame(() => {
        setAdjustedRect(targetRect);
      });
      return () => cancelAnimationFrame(timer);
    }
    setAdjustedRect(null);
  }, [targetRect]);

  // Full overlay with no cutout (for welcome/complete steps)
  if (!adjustedRect) {
    return (
      <div className="tour-spotlight-full" />
    );
  }

  const pad = padding;
  const rx = borderRadius;

  return (
    <svg className="tour-spotlight-svg" width="100%" height="100%">
      <defs>
        <mask id="tour-spotlight-mask">
          <rect width="100%" height="100%" fill="white" />
          <rect
            x={adjustedRect.left - pad}
            y={adjustedRect.top - pad}
            width={adjustedRect.width + pad * 2}
            height={adjustedRect.height + pad * 2}
            rx={rx}
            ry={rx}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="rgba(0, 0, 0, 0.65)"
        mask="url(#tour-spotlight-mask)"
      />
      {/* Animated border around cutout */}
      <rect
        className="tour-spotlight-border"
        x={adjustedRect.left - pad}
        y={adjustedRect.top - pad}
        width={adjustedRect.width + pad * 2}
        height={adjustedRect.height + pad * 2}
        rx={rx}
        ry={rx}
      />
    </svg>
  );
}
