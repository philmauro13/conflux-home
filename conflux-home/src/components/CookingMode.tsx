import { CookingStep } from '../types';

interface Props {
  steps: CookingStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export default function CookingMode({ steps, currentStep, onNext, onPrev, onClose }: Props) {
  if (steps.length === 0) return null;
  const step = steps[currentStep];

  return (
    <div className="cooking-mode-overlay">
      <div className="cooking-mode">
        <div className="cooking-mode-header">
          <span className="cooking-mode-progress">Step {currentStep + 1} of {steps.length}</span>
          <button className="cooking-mode-close" onClick={onClose}>✕</button>
        </div>
        <div className="cooking-mode-step">
          <div className="cooking-step-number">{step.step_number}</div>
          <p className="cooking-step-instruction">{step.instruction}</p>
          {step.duration_minutes && (
            <div className="cooking-step-timer">⏱️ {step.duration_minutes} min</div>
          )}
        </div>
        <div className="cooking-mode-nav">
          <button className="cooking-nav-btn" onClick={onPrev} disabled={currentStep === 0}>← Prev</button>
          <div className="cooking-dots">
            {steps.map((_, i) => (
              <span key={i} className={`cooking-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}`} />
            ))}
          </div>
          <button className="cooking-nav-btn" onClick={onNext} disabled={currentStep === steps.length - 1}>Next →</button>
        </div>
      </div>
    </div>
  );
}
