import { useState, useCallback, useEffect } from 'react';
import { View } from '../types';

interface ImmersiveViewProps {
  view: View;
  backgroundUrl: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ImmersiveView({ view, backgroundUrl, onClose, children }: ImmersiveViewProps) {
  const [exiting, setExiting] = useState(false);

  const handleClose = useCallback(() => {
    setExiting(true);
    // Match the exit animation duration
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleClose]);

  return (
    <div className={`immersive-overlay ${exiting ? 'immersive-exiting' : ''}`}>
      {backgroundUrl && (
        <>
          <div
            className="immersive-bg"
            style={{ backgroundImage: `url('${backgroundUrl}')` }}
          />
          <div className="immersive-gradient" />
        </>
      )}
      <button className="immersive-back-btn" onClick={handleClose}>
        ← Desktop
      </button>
      <div className="immersive-content">
        {children}
      </div>
    </div>
  );
}
