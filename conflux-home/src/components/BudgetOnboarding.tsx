// Conflux Home — Budget Onboarding / Guided Tour
// Phase 1: Setup (collect data) → Phase 2: Spotlight Tour (highlight real UI)
//
// LocalStorage contracts:
//   budget-onboarding-completed  — set after data setup saves; permanently skips onboarding flow
//   budget-tour-completed        — set after tour finishes; can be reset via Settings

import { useState, useEffect, useCallback, useRef } from 'react';
import TourSpotlight from './TourSpotlight';
import TourTooltip from './TourTooltip';
import { useTourState } from '../hooks/useTourState';
import '../styles/pulse-onboarding.css';

// ─── Storage Keys ───────────────────────────────────────────

const ONBOARDING_DONE_KEY = 'budget-onboarding-completed';
const TOUR_DONE_KEY = 'budget-tour-completed';

// ─── Types ───────────────────────────────────────────────────

export interface BudgetOnboardingProps {
  onComplete: () => void;
  onSaveConfig: (config: SetupConfig, isUpdate?: boolean) => Promise<{ isUpdate: boolean }>;
}

export interface SetupBucket {
  id: string;
  name: string;
  icon: string;
  monthly_goal: number;
  color: string;
}

export interface SetupConfig {
  payFrequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
  payDates: { p1: number; p2: number };
  monthlyIncome: number;
  buckets: SetupBucket[];
}

// ─── Setup State ─────────────────────────────────────────────

interface SetupState {
  step: 'boot' | 'setup' | 'tour';
  tourStep: number;
  config: SetupConfig;
  newBucket: { name: string; goal: string; icon: string; color: string };
  isSaving: boolean;
  error: string | null;
  pendingPreset: Omit<SetupBucket, 'id'> | null;
  pendingAmount: string;
  isUpdate: boolean;
}

const DEFAULT_CONFIG: SetupConfig = {
  payFrequency: 'semi-monthly',
  payDates: { p1: 1, p2: 15 },
  monthlyIncome: 0,
  buckets: [],
};

const PRESET_BUCKETS: Omit<SetupBucket, 'id'>[] = [
  { name: 'Rent / Mortgage', icon: '🏠', monthly_goal: 0, color: '#10b981' },
  { name: 'Groceries', icon: '🛒', monthly_goal: 0, color: '#3b82f6' },
  { name: 'Electric', icon: '⚡', monthly_goal: 0, color: '#f59e0b' },
  { name: 'Gas', icon: '🔥', monthly_goal: 0, color: '#ef4444' },
  { name: 'Water', icon: '💧', monthly_goal: 0, color: '#06b6d4' },
  { name: 'Internet', icon: '📶', monthly_goal: 0, color: '#8b5cf6' },
  { name: 'Phone', icon: '📱', monthly_goal: 0, color: '#ec4899' },
  { name: 'Transportation', icon: '🚗', monthly_goal: 0, color: '#6366f1' },
  { name: 'Savings', icon: '🏦', monthly_goal: 0, color: '#0ea5e9' },
];

// ─── 5-Step Spotlight Tour ───────────────────────────────────

const TOUR_STEPS = [
  {
    id: 'cockpit',
    title: 'Your Financial Cockpit',
    body: 'Income, obligations, and projected surplus — all in one glance. Pulse updates this in real-time as you log payments.',
    target: '.budget-cockpit',
  },
  {
    id: 'buckets',
    title: 'Every Dollar Has a Job',
    body: 'Each bucket is a spending category with a monthly target. Pulse divides that target across your pay periods so you know exactly what to set aside each paycheck.',
    target: '.matrix-container',
  },
  {
    id: 'log',
    title: 'Log Payments Fast',
    body: "Click LOG PAYMENT to record what you've paid. Select a bucket, enter the amount, confirm — Pulse updates the grid instantly.",
    target: '.btn-primary',
  },
  {
    id: 'nav',
    title: 'Navigate Your Budget',
    body: 'Use the period arrows to step through pay periods. Each column shows allocated vs. actually paid.',
    target: '.matrix-nav',
  },
  {
    id: 'nudge',
    title: "Pulse Doesn't Wait",
    body: 'Pulse watches your patterns. Running low on savings? Overspending in dining? It nudges you before problems grow.',
    target: '.pulse-proactive',
  },
];

// ─── Public Helpers ──────────────────────────────────────────

export function hasCompletedBudgetOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

export function resetBudgetTour(): void {
  localStorage.removeItem(TOUR_DONE_KEY);
  localStorage.removeItem(ONBOARDING_DONE_KEY);
}

// ─── Main Component ──────────────────────────────────────────

export default function BudgetOnboarding({ onComplete, onSaveConfig }: BudgetOnboardingProps) {
  const [state, setState] = useState<SetupState>({
    step: 'boot',
    tourStep: 0,
    config: DEFAULT_CONFIG,
    newBucket: { name: '', goal: '', icon: '💳', color: '#8b5cf6' },
    isSaving: false,
    error: null,
    pendingPreset: null,
    pendingAmount: '',
    isUpdate: false,
  });

  // Boot sequence → auto-advance to setup
  useEffect(() => {
    if (state.step !== 'boot') return;
    const t = setTimeout(() => setState(s => ({ ...s, step: 'setup' })), 2800);
    return () => clearTimeout(t);
  }, [state.step]);

  const updateConfig = useCallback((patch: Partial<SetupConfig>) => {
    setState(s => ({ ...s, config: { ...s.config, ...patch }, error: null }));
  }, []);

  const addBucket = useCallback(() => {
    const { newBucket } = state;
    if (!newBucket.name.trim() || !newBucket.goal) return;
    const bucket: SetupBucket = {
      id: `bucket-${Date.now()}`,
      name: newBucket.name.trim(),
      icon: newBucket.icon || '💳',
      monthly_goal: parseFloat(newBucket.goal) || 0,
      color: newBucket.color || '#8b5cf6',
    };
    setState(s => ({
      ...s,
      config: { ...s.config, buckets: [...s.config.buckets, bucket] },
      newBucket: { name: '', goal: '', icon: '💳', color: '#8b5cf6' },
    }));
  }, [state]);

  const removeBucket = useCallback((id: string) => {
    setState(s => ({
      ...s,
      config: { ...s.config, buckets: s.config.buckets.filter(b => b.id !== id) },
    }));
  }, []);

  const openPresetPopup = useCallback((preset: Omit<SetupBucket, 'id'>) => {
    setState(s => ({ ...s, pendingPreset: preset, pendingAmount: '' }));
  }, []);

  const confirmPresetBucket = useCallback(() => {
    const { pendingPreset, pendingAmount } = state;
    if (!pendingPreset || !pendingAmount) return;
    const bucket: SetupBucket = {
      id: `preset-${Date.now()}`,
      name: pendingPreset.name,
      icon: pendingPreset.icon,
      monthly_goal: parseFloat(pendingAmount) || 0,
      color: pendingPreset.color,
    };
    setState(s => ({
      ...s,
      config: { ...s.config, buckets: [...s.config.buckets, bucket] },
      pendingPreset: null,
      pendingAmount: '',
    }));
  }, [state]);

  const cancelPresetBucket = useCallback(() => {
    setState(s => ({ ...s, pendingPreset: null, pendingAmount: '' }));
  }, []);

  const handleFinishSetup = async () => {
    const { config } = state;
    if (config.monthlyIncome <= 0) {
      setState(s => ({ ...s, error: 'Please enter your monthly income.' }));
      return;
    }
    if (config.buckets.length === 0) {
      setState(s => ({ ...s, error: 'Add at least one bucket to track.' }));
      return;
    }
    setState(s => ({ ...s, isSaving: true, error: null }));
    try {
      // Check if this is an update (user already has data)
      const hasExistingData = localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
      const result = await onSaveConfig(config, !hasExistingData);
      // Mark onboarding as permanently done — data has been saved
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      setState(s => ({ ...s, step: 'tour', tourStep: 0, isUpdate: result.isUpdate }));
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

  if (state.step === 'boot') return <BootSequence />;

  if (state.step === 'setup') {
    return (
      <SetupModal
        config={state.config}
        newBucket={state.newBucket}
        isSaving={state.isSaving}
        error={state.error}
        pendingPreset={state.pendingPreset}
        pendingAmount={state.pendingAmount}
        isUpdate={state.isUpdate}
        onUpdateConfig={updateConfig}
        onUpdateNewBucket={s => setState(prev => ({ ...prev, newBucket: s }))}
        onAddBucket={addBucket}
        onRemoveBucket={removeBucket}
        onOpenPresetPopup={openPresetPopup}
        onConfirmPresetBucket={confirmPresetBucket}
        onCancelPresetBucket={cancelPresetBucket}
        onPendingAmountChange={s => setState(prev => ({ ...prev, pendingAmount: s }))}
        onFinish={handleFinishSetup}
      />
    );
  }

  // ─── Spotlight Tour (desktop-quality) ─────────────────────
  return (
    <BudgetSpotlightTour
      steps={TOUR_STEPS}
      currentStep={state.tourStep}
      onNext={handleTourNext}
      onSkip={handleComplete}
    />
  );
}

// ─── Budget Spotlight Tour (SVG-mask approach, desktop-quality) ───

interface BudgetSpotlightTourProps {
  steps: typeof TOUR_STEPS;
  currentStep: number;
  onNext: () => void;
  onSkip: () => void;
}

function BudgetSpotlightTour({ steps, currentStep, onNext, onSkip }: BudgetSpotlightTourProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isActive, setIsActive] = useState(true);
  const hasMovedRef = useRef(false);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  // Find target element and track its rect
  useEffect(() => {
    if (!isActive || !step) return;

    const updateRect = () => {
      // Small double-RAF to ensure DOM has settled after step change
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(step.target);
          if (el) {
            setTargetRect(el.getBoundingClientRect());
            hasMovedRef.current = false;
          } else {
            setTargetRect(null);
          }
        });
      });
    };

    const timer = setTimeout(updateRect, 80);
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
    <div className="budget-tour-root">
      {/* SVG spotlight with transparent cutout — matches desktop GuidedTour quality */}
      <TourSpotlight targetRect={targetRect} padding={8} borderRadius={12} verticalOffset={-50} />

      {/* Tour tooltip — auto-positions above/below target */}
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
        finishLabel="Enter Pulse"
      />
    </div>
  );
}

// ─── Boot Sequence ─────────────────────────────────────────────

function BootSequence() {
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
    <div className={`pulse-boot boot-${phase}`}>
      {/* Ambient floating particles */}
      <div className="pulse-boot-particles" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={`pulse-boot-particle particle-${i + 1}`} />
        ))}
      </div>
      <div className="pulse-boot-content">
        {phase >= 1 && <div className="pulse-boot-logo">PULSE</div>}
        {phase >= 2 && (
          <div className="pulse-boot-heart">
            <svg viewBox="0 0 100 100" className="pulse-boot-heart-svg">
              <path
                className="pulse-boot-heart-path"
                d="M50 88 C20 60, 5 40, 15 25 C25 10, 45 10, 50 25 C55 10, 75 10, 85 25 C95 40, 80 60, 50 88Z"
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
            </svg>
          </div>
        )}
        {phase >= 3 && <div className="pulse-boot-tagline">your financial heartbeat</div>}
      </div>
    </div>
  );
}

// ─── Setup Modal ─────────────────────────────────────────────

interface SetupModalProps {
  config: SetupConfig;
  newBucket: SetupState['newBucket'];
  isSaving: boolean;
  error: string | null;
  pendingPreset: Omit<SetupBucket, 'id'> | null;
  pendingAmount: string;
  isUpdate: boolean;
  onUpdateConfig: (patch: Partial<SetupConfig>) => void;
  onUpdateNewBucket: (s: SetupState['newBucket']) => void;
  onAddBucket: () => void;
  onRemoveBucket: (id: string) => void;
  onOpenPresetPopup: (preset: Omit<SetupBucket, 'id'>) => void;
  onConfirmPresetBucket: () => void;
  onCancelPresetBucket: () => void;
  onPendingAmountChange: (s: string) => void;
  onFinish: () => void;
}

function SetupModal({
  config, newBucket, isSaving, error,
  pendingPreset, pendingAmount, isUpdate,
  onUpdateConfig, onUpdateNewBucket, onAddBucket, onRemoveBucket,
  onOpenPresetPopup, onConfirmPresetBucket, onCancelPresetBucket,
  onPendingAmountChange, onFinish,
}: SetupModalProps) {
  const pendingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pendingPreset && pendingInputRef.current) pendingInputRef.current.focus();
  }, [pendingPreset]);

  const handlePendingKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onConfirmPresetBucket();
    if (e.key === 'Escape') onCancelPresetBucket();
  };

  // Check how many buckets have been configured
  const configuredCount = config.buckets.length;
  const totalPresets = PRESET_BUCKETS.length;
  const availablePresets = PRESET_BUCKETS.filter(
    pb => !config.buckets.some(cb => cb.name === pb.name)
  );

  return (
    <div className="pulse-setup-overlay">
      {/* Ambient background glow */}
      <div className="pulse-setup-bg-glow" aria-hidden="true" />

      <div className="pulse-setup-card">
        {/* ── Header ── */}
        <div className="pulse-setup-header">
          <div className="pulse-setup-icon-row">
            <div className="pulse-setup-icon">💚</div>
            <div className="pulse-setup-icon-pulse" aria-hidden="true" />
          </div>
          <h2 className="pulse-setup-title">{isUpdate ? 'Update Pulse' : 'Set Up Pulse'}</h2>
          <p className="pulse-setup-subtitle">
            {isUpdate
              ? 'Adjust your income, pay rhythm, or tracked buckets.'
              : "Tell Pulse about your income and we'll build your financial grid."}
          </p>
          {isUpdate && (
            <div className="pulse-setup-update-banner">
              Updating your existing Pulse configuration
            </div>
          )}
        </div>

        {/* ── Scrollable Content ── */}
        <div className="pulse-setup-body">
          {/* Step 01: Income */}
          <div className="pulse-setup-section">
            <label className="pulse-setup-label">
              <span className="pulse-setup-step-num">01</span>
              Monthly Income
            </label>
            <div className="pulse-setup-income-row">
              <span className="pulse-setup-dollar">$</span>
              <input
                type="number"
                className="pulse-setup-income-input"
                placeholder="4,400"
                value={config.monthlyIncome || ''}
                onChange={e => onUpdateConfig({ monthlyIncome: parseFloat(e.target.value) || 0 })}
                min="0"
                autoFocus
              />
            </div>
            <p className="pulse-setup-hint">Total take-home pay per month, after taxes.</p>
          </div>

          {/* Step 02: Pay Rhythm */}
          <div className="pulse-setup-section">
            <label className="pulse-setup-label">
              <span className="pulse-setup-step-num">02</span>
              Pay Rhythm
            </label>
            <div className="pulse-setup-rhythm-grid">
              {[
                { value: 'weekly', label: 'Weekly' },
                { value: 'bi-weekly', label: 'Bi-weekly' },
                { value: 'semi-monthly', label: 'Semi-monthly' },
                { value: 'monthly', label: 'Monthly' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  className={`pulse-setup-rhythm-btn ${config.payFrequency === value ? 'active' : ''}`}
                  onClick={() => onUpdateConfig({ payFrequency: value as SetupConfig['payFrequency'] })}
                >
                  {label}
                </button>
              ))}
            </div>

            {config.payFrequency === 'bi-weekly' && (
              <div className="pulse-setup-paydays">
                <div className="pulse-setup-payday-group">
                  <label>First Pay Day</label>
                  <input
                    type="number" min="1" max="31"
                    value={config.payDates.p1}
                    onChange={e => onUpdateConfig({ payDates: { ...config.payDates, p1: parseInt(e.target.value) || 1 } })}
                  />
                </div>
                <span className="pulse-setup-payday-and">—</span>
                <div className="pulse-setup-payday-group">
                  <label>Second Pay Day</label>
                  <input
                    type="number" min="1" max="31"
                    value={config.payDates.p2}
                    onChange={e => onUpdateConfig({ payDates: { ...config.payDates, p2: parseInt(e.target.value) || 15 } })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Step 03: Buckets */}
          <div className="pulse-setup-section">
            <label className="pulse-setup-label">
              <span className="pulse-setup-step-num">03</span>
              Spending Buckets
              {configuredCount > 0 && (
                <span className="pulse-setup-bucket-count">{configuredCount} added</span>
              )}
            </label>
            <p className="pulse-setup-hint" style={{ marginBottom: 12 }}>
              Click a category, enter the monthly amount.
            </p>

            {/* Bucket list */}
            {config.buckets.length > 0 && (
              <div className="pulse-setup-bucket-list">
                {config.buckets.map(b => (
                  <div key={b.id} className="pulse-setup-bucket-row">
                    <span
                      className="pulse-setup-bucket-dot"
                      style={{ background: b.color }}
                    />
                    <span className="pulse-setup-bucket-icon">{b.icon}</span>
                    <span className="pulse-setup-bucket-name">{b.name}</span>
                    <span className="pulse-setup-bucket-goal">${b.monthly_goal.toLocaleString()}/mo</span>
                    <button className="pulse-setup-bucket-remove" onClick={() => onRemoveBucket(b.id)} aria-label={`Remove ${b.name}`}>✕</button>
                  </div>
                ))}
              </div>
            )}

            {/* Preset grid */}
            {availablePresets.length > 0 && (
              <div className="pulse-setup-presets">
                {availablePresets.map(pb => (
                  <button
                    key={pb.name}
                    className="pulse-setup-preset-btn"
                    style={{ '--preset-color': pb.color } as React.CSSProperties}
                    onClick={() => onOpenPresetPopup(pb)}
                  >
                    <span>{pb.icon}</span>
                    <span>{pb.name}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Custom bucket add */}
            <div className="pulse-setup-add-bucket">
              <input
                type="text" placeholder="Bucket name (e.g. Netflix)"
                value={newBucket.name}
                onChange={e => onUpdateNewBucket({ ...newBucket, name: e.target.value })}
                className="pulse-setup-bucket-name-input"
              />
              <div className="pulse-setup-bucket-goal-input-wrap">
                <span>$</span>
                <input
                  type="number" placeholder="Monthly $"
                  value={newBucket.goal}
                  onChange={e => onUpdateNewBucket({ ...newBucket, goal: e.target.value })}
                />
              </div>
              <button
                className="pulse-setup-add-btn"
                onClick={onAddBucket}
                disabled={!newBucket.name.trim() || !newBucket.goal}
                aria-label="Add bucket"
              >
                +
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="pulse-setup-error" role="alert">
              <span className="pulse-setup-error-icon">⚠️</span>
              {error}
            </div>
          )}
        </div>

        {/* ── Fixed Footer — always visible, never clipped ── */}
        <div className="pulse-setup-footer">
          <button
            className="pulse-setup-finish"
            onClick={onFinish}
            disabled={isSaving}
          >
            {isSaving ? (
              <span className="pulse-setup-saving">
                <span className="pulse-setup-spinner" aria-hidden="true" />
                Setting up Pulse...
              </span>
            ) : isUpdate ? (
              'Save Changes →'
            ) : (
              'Launch Pulse →'
            )}
          </button>
        </div>

        {/* Preset amount popup — rendered above footer but inside card */}
        {pendingPreset && (
          <div className="pulse-preset-popup-overlay" onClick={onCancelPresetBucket}>
            <div className="pulse-preset-popup" onClick={e => e.stopPropagation()}>
              <div className="pulse-preset-popup-header">
                <span className="pulse-preset-popup-icon">{pendingPreset.icon}</span>
                <span className="pulse-preset-popup-name">{pendingPreset.name}</span>
              </div>
              <p className="pulse-preset-popup-question">
                How much do you pay monthly for {pendingPreset.name.toLowerCase()}?
              </p>
              <div className="pulse-preset-popup-input-row">
                <span className="pulse-preset-popup-dollar">$</span>
                <input
                  ref={pendingInputRef}
                  type="number"
                  className="pulse-preset-popup-input"
                  placeholder="0"
                  value={pendingAmount}
                  onChange={e => onPendingAmountChange(e.target.value)}
                  onKeyDown={handlePendingKey}
                  min="0"
                />
              </div>
              <div className="pulse-preset-popup-actions">
                <button className="pulse-preset-popup-cancel" onClick={onCancelPresetBucket}>Cancel</button>
                <button
                  className="pulse-preset-popup-confirm"
                  onClick={onConfirmPresetBucket}
                  disabled={!pendingAmount || parseFloat(pendingAmount) <= 0}
                >
                  Add ${pendingAmount || '0'} / mo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
