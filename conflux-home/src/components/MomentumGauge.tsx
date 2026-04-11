import React, { useEffect, useState } from 'react';
import { playOrbitAltitudeThreshold } from '../lib/sound';

interface MomentumGaugeProps {
  percentage: number;  // 0-100
  label: string;
  sublabel?: string;
}

function getGaugeColor(pct: number): string {
  if (pct < 50) return '#3b82f6';  // Blue
  if (pct < 80) return '#10b981';  // Emerald
  return '#f59e0b';                // Gold
}

export function MomentumGauge({ percentage, label, sublabel }: MomentumGaugeProps) {
  const color = getGaugeColor(percentage);
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  
  const isHighMomentum = percentage >= 80;
  
  // Track previous percentage for threshold detection
  const [prevPercentage, setPrevPercentage] = useState(percentage);
  
  useEffect(() => {
    // Check for threshold crossings
    const thresholds = [50, 80, 100];
    thresholds.forEach(threshold => {
      if (prevPercentage < threshold && percentage >= threshold) {
        playOrbitAltitudeThreshold(percentage);
      }
    });
    setPrevPercentage(percentage);
  }, [percentage, prevPercentage]);
  
  return (
    <div 
      className={`mc-momentum-gauge${isHighMomentum ? ' high-momentum' : ''}`} 
      style={{ '--gauge-color': color } as React.CSSProperties}
    >
      <svg viewBox="0 0 100 100" className="mc-gauge-svg">
        {/* Background circle */}
        <circle
          className="mc-gauge-bg"
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="8"
        />
        {/* Progress circle */}
        <circle
          className="mc-gauge-progress"
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
        {/* Center text */}
        <text x="50" y="45" textAnchor="middle" className="mc-gauge-value">
          {Math.round(percentage)}%
        </text>
        <text x="50" y="60" textAnchor="middle" className="mc-gauge-label">
          {label}
        </text>
      </svg>
      {sublabel && <div className="mc-gauge-sublabel">{sublabel}</div>}
    </div>
  );
}
