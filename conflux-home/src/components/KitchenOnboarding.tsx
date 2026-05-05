// Conflux Home — Kitchen Onboarding / Guided Tour
// Phase 1: Boot → Phase 2: Setup (collect preferences) → Phase 3: Spotlight Tour
//
// LocalStorage contracts:
//   kitchen-onboarding-completed  — set after setup saves; permanently skips onboarding
//   kitchen-tour-completed        — set after tour finishes; can be reset via Settings

import { useState, useEffect, useCallback, useRef } from 'react';
import TourSpotlight from './TourSpotlight';
import TourTooltip from './TourTooltip';
import '../styles/kitchen-onboarding.css';

// ─── Storage Keys ───────────────────────────────────────────

const ONBOARDING_DONE_KEY = 'kitchen-onboarding-completed';
const TOUR_DONE_KEY = 'kitchen-tour-completed';

// ─── Types ───────────────────────────────────────────────────

export interface KitchenOnboardingProps {
  onComplete: () => void;
  onSaveConfig: (config: KitchenSetupConfig) => Promise<void>;
}

export interface KitchenSetupConfig {
  dietaryPreferences: string[];
  householdSize: number;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  favoriteCuisines: string[];
}

// ─── Setup State ─────────────────────────────────────────────

interface SetupState {
  step: 'boot' | 'setup' | 'tour';
  tourStep: number;
  config: KitchenSetupConfig;
  isSaving: boolean;
  error: string | null;
}

const DEFAULT_CONFIG: KitchenSetupConfig = {
  dietaryPreferences: [],
  householdSize: 2,
  skillLevel: 'intermediate',
  favoriteCuisines: [],
};

const DIETARY_OPTIONS = [
  { value: 'none', label: 'No restrictions', icon: '🍽️' },
  { value: 'vegetarian', label: 'Vegetarian', icon: '🥬' },
  { value: 'vegan', label: 'Vegan', icon: '🌱' },
  { value: 'gluten-free', label: 'Gluten-Free', icon: '🌾' },
  { value: 'dairy-free', label: 'Dairy-Free', icon: '🥛' },
  { value: 'keto', label: 'Keto', icon: '🥑' },
  { value: 'halal', label: 'Halal', icon: '🌙' },
  { value: 'kosher', label: 'Kosher', icon: '✡️' },
];

const CUISINE_OPTIONS = [
  { value: 'italian', label: 'Italian', icon: '🇮🇹' },
  { value: 'mexican', label: 'Mexican', icon: '🇲🇽' },
  { value: 'asian', label: 'Asian', icon: '🥢' },
  { value: 'indian', label: 'Indian', icon: '🇮🇳' },
  { value: 'american', label: 'American', icon: '🇺🇸' },
  { value: 'mediterranean', label: 'Mediterranean', icon: '🫒' },
  { value: 'japanese', label: 'Japanese', icon: '🇯🇵' },
  { value: 'thai', label: 'Thai', icon: '🇹🇭' },
  { value: 'french', label: 'French', icon: '🇫🇷' },
  { value: 'korean', label: 'Korean', icon: '🇰🇷' },
];

// ─── 5-Step Spotlight Tour ───────────────────────────────────

const TOUR_STEPS = [
  {
    id: 'home',
    title: 'Your Kitchen Dashboard',
    body: 'Home shows today\'s menu, what you can cook right now, and smart nudges — like "use that chicken before it expires." Hearth watches your fridge so you don\'t have to.',
    target: '.kitchen-home',
  },
  {
    id: 'library',
    title: 'Your Recipe Library',
    body: 'Every meal you add lives here. Tell Hearth "I made pasta carbonara" and it saves the recipe, tracks ingredients, and calculates cost per serving. Add meals by typing or speaking naturally.',
    target: '.kitchen-library',
  },
  {
    id: 'plan',
    title: 'Plan Your Week',
    body: 'Drag meals into breakfast, lunch, and dinner slots. Hearth calculates your total food budget and generates a grocery list automatically. Say "plan my week" and it does the rest.',
    target: '.kitchen-plan',
  },
  {
    id: 'grocery',
    title: 'Smart Grocery List',
    body: 'Auto-generated from your meal plan. Ingredients are aggregated across recipes — if two meals need chicken, Hearth combines the quantities. Check items off as you shop.',
    target: '.kitchen-grocery',
  },
  {
    id: 'pantry',
    title: 'Track What You Have',
    body: 'Your fridge, freezer, and pantry — all in one place. Scan items, track expiry dates, and Hearth tells you what you can make with what you have. No more forgotten leftovers.',
    target: '.kitchen-pantry',
  },
];

// ─── Public Helpers ──────────────────────────────────────────

export function hasCompletedKitchenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

export function resetKitchenTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
}

export function resetHearthOnboarding(): void {
  localStorage.removeItem('hearth-onboarding-completed');
  localStorage.removeItem('hearth-boot-done');
}

// ─── Main Component ──────────────────────────────────────────

export default function KitchenOnboarding({ onComplete, onSaveConfig }: KitchenOnboardingProps) {
  const [state, setState] = useState<SetupState>({
    step: 'boot',
    tourStep: 0,
    config: DEFAULT_CONFIG,
    isSaving: false,
    error: null,
  });

  // Boot sequence → auto-advance to setup
  useEffect(() => {
    if (state.step !== 'boot') return;
    const t = setTimeout(() => setState(s => ({ ...s, step: 'setup' })), 2800);
    return () => clearTimeout(t);
  }, [state.step]);

  const toggleDietary = useCallback((value: string) => {
    setState(s => {
      const prefs = s.config.dietaryPreferences;
      const next = value === 'none'
        ? []
        : prefs.includes(value)
          ? prefs.filter(v => v !== value)
          : [...prefs.filter(v => v !== 'none'), value];
      return { ...s, config: { ...s.config, dietaryPreferences: next }, error: null };
    });
  }, []);

  const toggleCuisine = useCallback((value: string) => {
    setState(s => {
      const cuisines = s.config.favoriteCuisines;
      const next = cuisines.includes(value)
        ? cuisines.filter(v => v !== value)
        : [...cuisines, value];
      return { ...s, config: { ...s.config, favoriteCuisines: next }, error: null };
    });
  }, []);

  const handleFinishSetup = async () => {
    setState(s => ({ ...s, isSaving: true, error: null }));
    try {
      await onSaveConfig(state.config);
      // Only mark onboarding complete AFTER config saves successfully.
      // onComplete will be called in the tour completion handler — that is
      // the REAL signal that the user has finished onboarding.
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      setState(s => ({ ...s, step: 'tour', tourStep: 0 }));
    } catch {
      setState(s => ({ ...s, isSaving: false, error: 'Failed to save. Try again.' }));
    }
  };

  const handleTourNext = () => {
    if (state.tourStep < TOUR_STEPS.length - 1) {
      setState(s => ({ ...s, tourStep: s.tourStep + 1 }));
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_DONE_KEY, 'true');
    onComplete();
  };

  // ─── Render ────────────────────────────────────────────────

  if (state.step === 'boot') return <HearthBootSequence />;

  if (state.step === 'setup') {
    return (
      <HearthSetupModal
        config={state.config}
        isSaving={state.isSaving}
        error={state.error}
        onToggleDietary={toggleDietary}
        onToggleCuisine={toggleCuisine}
        onSetHouseholdSize={size => setState(s => ({ ...s, config: { ...s.config, householdSize: size } }))}
        onSetSkillLevel={level => setState(s => ({ ...s, config: { ...s.config, skillLevel: level } }))}
        onFinish={handleFinishSetup}
      />
    );
  }

  // ─── Spotlight Tour ───────────────────────────────────────
  return (
    <KitchenSpotlightTour
      steps={TOUR_STEPS}
      currentStep={state.tourStep}
      onNext={handleTourNext}
      onSkip={handleComplete}
    />
  );
}

// ─── Boot Sequence ─────────────────────────────────────────────

function HearthBootSequence() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 800),
      setTimeout(() => setPhase(3), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className={`hearth-boot boot-${phase}`}>
      {/* Ambient embers */}
      <div className="hearth-boot-embers" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className={`hearth-ember ember-${i + 1}`} />
        ))}
      </div>
      <div className="hearth-boot-content">
        {phase >= 1 && <div className="hearth-boot-logo">HEARTH</div>}
        {phase >= 2 && (
          <div className="hearth-boot-icon">
            <svg viewBox="0 0 100 100" className="hearth-boot-flame-svg">
              <path
                className="hearth-boot-flame-path"
                d="M50 90 C25 70, 10 50, 20 30 C25 18, 35 10, 50 20 C55 10, 65 5, 70 15 C80 30, 75 55, 50 90Z"
                fill="none"
                stroke="#F59E0B"
                strokeWidth="2"
              />
            </svg>
          </div>
        )}
        {phase >= 3 && <div className="hearth-boot-tagline">your kitchen, powered by AI</div>}
      </div>
    </div>
  );
}

// ─── Setup Modal ─────────────────────────────────────────────

interface HearthSetupModalProps {
  config: KitchenSetupConfig;
  isSaving: boolean;
  error: string | null;
  onToggleDietary: (value: string) => void;
  onToggleCuisine: (value: string) => void;
  onSetHouseholdSize: (size: number) => void;
  onSetSkillLevel: (level: 'beginner' | 'intermediate' | 'advanced') => void;
  onFinish: () => void;
}

function HearthSetupModal({
  config, isSaving, error,
  onToggleDietary, onToggleCuisine, onSetHouseholdSize, onSetSkillLevel, onFinish,
}: HearthSetupModalProps) {
  return (
    <div className="hearth-setup-overlay">
      <div className="hearth-setup-bg-glow" aria-hidden="true" />

      <div className="hearth-setup-card">
        {/* Header */}
        <div className="hearth-setup-header">
          <div className="hearth-setup-icon-row">
            <div className="hearth-setup-icon">🔥</div>
            <div className="hearth-setup-icon-pulse" aria-hidden="true" />
          </div>
          <h2 className="hearth-setup-title">Set Up Hearth</h2>
          <p className="hearth-setup-subtitle">
            Tell Hearth about your kitchen and it'll plan meals, track your fridge, and save you money.
          </p>
        </div>

        {/* Body */}
        <div className="hearth-setup-body">
          {/* Step 01: Household Size */}
          <div className="hearth-setup-section">
            <label className="hearth-setup-label">
              <span className="hearth-setup-step-num">01</span>
              How many people?
            </label>
            <div className="hearth-setup-size-row">
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  className={`hearth-size-btn ${config.householdSize === n ? 'active' : ''}`}
                  onClick={() => onSetHouseholdSize(n)}
                >
                  {n === 6 ? '6+' : n}
                </button>
              ))}
            </div>
            <p className="hearth-setup-hint">Hearth adjusts portion sizes and grocery quantities.</p>
          </div>

          {/* Step 02: Dietary Preferences */}
          <div className="hearth-setup-section">
            <label className="hearth-setup-label">
              <span className="hearth-setup-step-num">02</span>
              Dietary Preferences
            </label>
            <div className="hearth-setup-chip-grid">
              {DIETARY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`hearth-chip ${config.dietaryPreferences.includes(opt.value) || (opt.value === 'none' && config.dietaryPreferences.length === 0) ? 'active' : ''}`}
                  onClick={() => onToggleDietary(opt.value)}
                >
                  <span className="hearth-chip-icon">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hearth-setup-hint">Hearth filters recipes and suggests meals that fit your diet.</p>
          </div>

          {/* Step 03: Skill Level */}
          <div className="hearth-setup-section">
            <label className="hearth-setup-label">
              <span className="hearth-setup-step-num">03</span>
              Cooking Skill
            </label>
            <div className="hearth-setup-skill-row">
              {[
                { value: 'beginner' as const, label: 'Beginner', icon: '🍳', desc: 'Simple recipes' },
                { value: 'intermediate' as const, label: 'Intermediate', icon: '👨‍🍳', desc: 'Most recipes' },
                { value: 'advanced' as const, label: 'Advanced', icon: '⭐', desc: 'Challenge me' },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`hearth-skill-btn ${config.skillLevel === opt.value ? 'active' : ''}`}
                  onClick={() => onSetSkillLevel(opt.value)}
                >
                  <span className="hearth-skill-icon">{opt.icon}</span>
                  <span className="hearth-skill-label">{opt.label}</span>
                  <span className="hearth-skill-desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 04: Favorite Cuisines */}
          <div className="hearth-setup-section">
            <label className="hearth-setup-label">
              <span className="hearth-setup-step-num">04</span>
              Favorite Cuisines
            </label>
            <div className="hearth-setup-chip-grid">
              {CUISINE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`hearth-chip ${config.favoriteCuisines.includes(opt.value) ? 'active' : ''}`}
                  onClick={() => onToggleCuisine(opt.value)}
                >
                  <span className="hearth-chip-icon">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="hearth-setup-hint">Hearth prioritizes recipes from your favorite cuisines.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="hearth-setup-footer">
          {error && <div className="hearth-setup-error">{error}</div>}
          <button
            className="hearth-setup-finish"
            onClick={onFinish}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Start Cooking →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Kitchen Spotlight Tour ───────────────────────────────────

interface KitchenSpotlightTourProps {
  steps: typeof TOUR_STEPS;
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
}

function KitchenSpotlightTour({ steps, currentStep, onNext, onSkip }: KitchenSpotlightTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isActive, setIsActive] = useState(true);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  // Find target element and track its rect
  useEffect(() => {
    if (!isActive || !step) return;

    // Switch to the right tab first
    const tabMap: Record<string, string> = {
      '.kitchen-home': 'home',
      '.kitchen-library': 'library',
      '.kitchen-plan': 'plan',
      '.kitchen-grocery': 'grocery',
      '.kitchen-pantry': 'pantry',
    };
    const tabName = tabMap[step.target];
    if (tabName) {
      const tabBtn = document.querySelector(`.kitchen-tab[data-tab="${tabName}"]`) as HTMLButtonElement;
      if (tabBtn && !tabBtn.classList.contains('active')) {
        tabBtn.click();
      }
    }

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

    const timer = setTimeout(updateRect, 300);
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
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setIsActive(false); onSkip(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNext, onSkip]);

  if (!isActive) return null;

  return (
    <div className="kitchen-tour-root">
      <TourSpotlight targetRect={targetRect} padding={8} borderRadius={12} />
      <TourTooltip
        targetRect={targetRect}
        title={step.title}
        text={step.body}
        step={currentStep}
        total={steps.length}
        onNext={onNext}
        onSkip={() => { setIsActive(false); onSkip(); }}
        isLast={isLast}
        isFirst={currentStep === 0}
      />
    </div>
  );
}
