import React from 'react';

interface GridBackgroundProps {
  className?: string;
}

/**
 * Subtle tactical grid overlay background.
 * Renders a fixed-position grid with radial fade.
 */
export default function GridBackground({ className = '' }: GridBackgroundProps) {
  return (
    <div className={`radar-grid-bg ${className}`} aria-hidden="true" />
  );
}
