// Conflux Home — Foundation Onboarding
// "Let's build your home's profile" — 5 quick steps to set up Foundation
//
// LocalStorage: 'foundation-onboarding-completed' (permanent)

import { useState, useCallback } from 'react';
import { useHomeHealth } from '../hooks/useHomeHealth';
import type { HomeProfile } from '../types';
import '../styles/foundation-onboarding.css';

const ONBOARDING_DONE_KEY = 'foundation-onboarding-completed';

const SYSTEM_OPTIONS = [
  { id: 'hvac', icon: '🏠', label: 'HVAC / Heating & Cooling', color: '#3b82f6', desc: 'Furnace, AC, heat pump' },
  { id: 'plumbing', icon: '💧', label: 'Plumbing', color: '#06b6d4', desc: 'Water heater, pipes, fixtures' },
  { id: 'electrical', icon: '⚡', label: 'Electrical', color: '#f59e0b', desc: 'Panel, outlets, wiring' },
  { id: 'roof', icon: '🛡️', label: 'Roof & Exterior', color: '#64748b', desc: 'Shingles, gutters, siding' },
  { id: 'appliances', icon: '🔌', label: 'Major Appliances', color: '#8b5cf6', desc: 'Fridge, stove, washer, dryer' },
  { id: 'pest', icon: '🐜', label: 'Pest Control', color: '#10b981', desc: 'Quarterly inspections' },
];

export function hasCompletedFoundationOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

interface HomeProfileInput {
  address: string;
  yearBuilt: string;
  squareFeet: string;
  ownership: 'own' | 'rent';
  systems: string[];
  alertLevel: 'all' | 'important' | 'critical';
}

interface Props {
  onComplete: (createdProfile?: HomeProfile) => void;
}

export default function FoundationOnboarding({ onComplete }: Props) {
  const { upsertProfile } = useHomeHealth();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<HomeProfileInput>({
    address: '',
    yearBuilt: '',
    squareFeet: '',
    ownership: 'own',
    systems: ['hvac', 'plumbing'],
    alertLevel: 'important',
  });
  const [saving, setSaving] = useState(false);

  const TOTAL_STEPS = 4;

  const updateProfile = useCallback((patch: Partial<HomeProfileInput>) => {
    setProfile(p => ({ ...p, ...patch }));
  }, []);

  const toggleSystem = useCallback((id: string) => {
    setProfile(p => ({
      ...p,
      systems: p.systems.includes(id)
        ? p.systems.filter(s => s !== id)
        : [...p.systems, id],
    }));
  }, []);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      const createdProfile = await upsertProfile({
        yearBuilt: profile.yearBuilt ? parseInt(profile.yearBuilt) : undefined,
        squareFeet: profile.squareFeet ? parseInt(profile.squareFeet) : undefined,
      });
      localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
      await new Promise(r => setTimeout(r, 600));
      onComplete(createdProfile);
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  }, [profile, upsertProfile, onComplete]);

  const canAdvance =
    step === 0 ||
    (step === 1 && (profile.address.trim() || true)) ||
    (step === 2 && profile.systems.length > 0) ||
    step === 3;

  const stepTitles = [
    { title: 'Welcome to Foundation', subtitle: 'Your home\'s nerve center' },
    { title: 'Tell us about your home', subtitle: 'The more we know, the better we protect' },
    { title: 'What should we monitor?', subtitle: 'Select every system you want Foundation to watch' },
    { title: 'How alert should we be?', subtitle: 'Foundation will only打扰 you when it matters' },
  ];

  const current = stepTitles[step];

  return (
    <div className="foundation-onboard-root">
      {/* Blueprint grid */}
      <div className="foundation-onboard-grid" aria-hidden="true" />
      {/* Ambient glow */}
      <div className="foundation-onboard-glow" aria-hidden="true" />

      <div className="foundation-onboard-card">
        {/* Step indicator */}
        <div className="foundation-onboard-progress">
          <div className="foundation-onboard-progress-steps">
            {stepTitles.map((_, i) => (
              <div
                key={i}
                className={`foundation-onboard-progress-step ${i === step ? 'active' : i < step ? 'done' : ''}`}
              />
            ))}
          </div>
          <span className="foundation-onboard-progress-label">
            Step {step + 1} of {TOTAL_STEPS}
          </span>
        </div>

        {/* Header */}
        <div className="foundation-onboard-header">
          <div className="foundation-onboard-icon">
            {step === 0 ? '🛡️' : step === 1 ? '🏠' : step === 2 ? '⚙️' : '🔔'}
          </div>
          <h2 className="foundation-onboard-title">{current.title}</h2>
          <p className="foundation-onboard-subtitle">{current.subtitle}</p>
        </div>

        {/* Step content */}
        <div className="foundation-onboard-body">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="foundation-onboard-welcome">
              <div className="foundation-onboard-welcome-graphic">
                <div className="foundation-onboard-shield">
                  <svg viewBox="0 0 60 70" className="foundation-onboard-shield-svg">
                    <path
                      d="M30 5 L55 15 L55 35 Q55 55 30 65 Q5 55 5 35 L5 15 Z"
                      fill="none"
                      stroke="rgba(100,116,139,0.5)"
                      strokeWidth="1.5"
                      className="foundation-onboard-shield-path"
                    />
                    <text x="30" y="42" textAnchor="middle" fontSize="22">🏠</text>
                  </svg>
                </div>
              </div>
              <div className="foundation-onboard-welcome-features">
                {[
                  { icon: '📊', text: 'Health Score — a single number for your home\'s condition' },
                  { icon: '🔍', text: 'AI Diagnosis — describe a problem, get expert guidance' },
                  { icon: '📅', text: 'Maintenance Calendar — never miss seasonal tasks' },
                  { icon: '🛡️', text: 'Warranty Vault — store and track your important documents' },
                ].map(f => (
                  <div key={f.text} className="foundation-onboard-feature-row">
                    <span className="foundation-onboard-feature-icon">{f.icon}</span>
                    <span className="foundation-onboard-feature-text">{f.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Home Profile */}
          {step === 1 && (
            <div className="foundation-onboard-form">
              <div className="foundation-onboard-field">
                <label>Street Address</label>
                <input
                  type="text"
                  className="foundation-onboard-input"
                  placeholder="123 Oak Street"
                  value={profile.address}
                  onChange={e => updateProfile({ address: e.target.value })}
                />
              </div>

              <div className="foundation-onboard-row">
                <div className="foundation-onboard-field">
                  <label>Year Built</label>
                  <input
                    type="number"
                    className="foundation-onboard-input"
                    placeholder="e.g. 1998"
                    min="1800"
                    max={new Date().getFullYear()}
                    value={profile.yearBuilt}
                    onChange={e => updateProfile({ yearBuilt: e.target.value })}
                  />
                </div>
                <div className="foundation-onboard-field">
                  <label>Square Feet</label>
                  <input
                    type="number"
                    className="foundation-onboard-input"
                    placeholder="e.g. 2100"
                    min="100"
                    value={profile.squareFeet}
                    onChange={e => updateProfile({ squareFeet: e.target.value })}
                  />
                </div>
              </div>

              <div className="foundation-onboard-field">
                <label>Ownership</label>
                <div className="foundation-onboard-ownership-grid">
                  {[
                    { value: 'own', label: '🏡 Own', desc: 'Track everything' },
                    { value: 'rent', label: '🔑 Rent', desc: 'Shared with landlord' },
                  ].map(o => (
                    <button
                      key={o.value}
                      className={`foundation-onboard-ownership-btn ${profile.ownership === o.value ? 'active' : ''}`}
                      onClick={() => updateProfile({ ownership: o.value as 'own' | 'rent' })}
                    >
                      <span className="foundation-onboard-ownership-label">{o.label}</span>
                      <span className="foundation-onboard-ownership-desc">{o.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: System Selection */}
          {step === 2 && (
            <div className="foundation-onboard-systems">
              <div className="foundation-onboard-systems-grid">
                {SYSTEM_OPTIONS.map(sys => {
                  const isSelected = profile.systems.includes(sys.id);
                  return (
                    <button
                      key={sys.id}
                      className={`foundation-onboard-system-btn ${isSelected ? 'selected' : ''}`}
                      style={{ '--sys-color': sys.color } as React.CSSProperties}
                      onClick={() => toggleSystem(sys.id)}
                    >
                      <span className="foundation-onboard-system-icon">{sys.icon}</span>
                      <span className="foundation-onboard-system-label">{sys.label}</span>
                      <span className="foundation-onboard-system-desc">{sys.desc}</span>
                      {isSelected && <div className="foundation-onboard-system-check">✓</div>}
                    </button>
                  );
                })}
              </div>
              {profile.systems.length === 0 && (
                <p className="foundation-onboard-systems-hint">Select at least one system to monitor</p>
              )}
            </div>
          )}

          {/* Step 3: Alert Level */}
          {step === 3 && (
            <div className="foundation-onboard-alert-options">
              {[
                {
                  value: 'all',
                  icon: '🔔',
                  title: 'All Alerts',
                  desc: 'Every scheduled task, every reminder. Stay on top of everything.',
                  color: '#3b82f6',
                },
                {
                  value: 'important',
                  icon: '⚠️',
                  title: 'Important Only',
                  desc: 'Only alerts for overdue tasks and urgent warnings. Less noise.',
                  color: '#f59e0b',
                },
                {
                  value: 'critical',
                  icon: '🚨',
                  title: 'Critical Only',
                  desc: 'Only the most urgent alerts. You\'ll handle the rest on your own.',
                  color: '#ef4444',
                },
              ].map(opt => (
                <button
                  key={opt.value}
                  className={`foundation-onboard-alert-btn ${profile.alertLevel === opt.value ? 'selected' : ''}`}
                  style={{ '--alert-color': opt.color } as React.CSSProperties}
                  onClick={() => updateProfile({ alertLevel: opt.value as HomeProfileInput['alertLevel'] })}
                >
                  <span className="foundation-onboard-alert-icon">{opt.icon}</span>
                  <div className="foundation-onboard-alert-content">
                    <span className="foundation-onboard-alert-title">{opt.title}</span>
                    <span className="foundation-onboard-alert-desc">{opt.desc}</span>
                  </div>
                  {profile.alertLevel === opt.value && (
                    <div className="foundation-onboard-alert-check">✓</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="foundation-onboard-footer">
          {step > 0 && (
            <button
              className="foundation-onboard-back"
              onClick={() => setStep(s => s - 1)}
            >
              ← Back
            </button>
          )}
          <button
            className="foundation-onboard-next"
            onClick={() => {
              if (step < TOTAL_STEPS - 1) {
                setStep(s => s + 1);
              } else {
                handleFinish();
              }
            }}
            disabled={!canAdvance || saving}
          >
            {saving ? (
              <span className="foundation-onboard-saving">
                <span className="foundation-onboard-spinner" />
                Securing your home...
              </span>
            ) : step === TOTAL_STEPS - 1 ? (
              '✓ Enter Foundation'
            ) : (
              'Continue →'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
