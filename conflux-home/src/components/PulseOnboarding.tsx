// Conflux Home — Budget Onboarding (Pulse)
// "The First Pulse" — one question, one heartbeat, the budget begins.
//
// LocalStorage: 'pulse-onboarding-completed' (permanent — one time only)
//
// Design: deep emerald + charcoal, floating particles, glowing heart,
//         single question → income parse → budget initialized → save
//
// Pattern: follows HearthOnboarding.tsx (recipe card = budget preview here)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBudgetEngine } from '../hooks/useBudgetEngine';
import '../styles/pulse-onboarding-v2.css';

const ONBOARDING_DONE_KEY = 'pulse-onboarding-completed';

interface BudgetSetupConfig {
  incomeAmount: number;
  payFrequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
}

interface ParsedSetup {
  incomeAmount: number;
  payFrequency: 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly';
  estimatedObligations: number;
  suggestedCategories: { name: string; icon: string; color: string; monthly_goal: number }[];
}

interface Props {
  onComplete: () => void;
}

export function hasCompletedPulseOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

export default function PulseOnboarding({ onComplete }: Props) {
  const { updateSettings, createBucket } = useBudgetEngine();
  const [phase, setPhase] = useState<'question' | 'interpreting' | 'preview' | 'saving'>('question');
  const [incomeInput, setIncomeInput] = useState('');
  const [parsed, setParsed] = useState<ParsedSetup | null>(null);
  const [editedIncome, setEditedIncome] = useState('');
  const [t, setT] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<{ x: number; y: number; r: number; alpha: number; speed: number; phase: number }[]>([]);

  // Animated background — floating emerald particles + ambient glow
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particlesRef.current = Array.from({ length: 18 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 3 + 1.5,
        alpha: Math.random() * 0.45 + 0.25,
        speed: Math.random() * 0.01 + 0.005,
        phase: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    let tick = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tick += 1;
      setT(tick);

      // Ambient glow at bottom center
      const cx = canvas.width / 2;
      const cy = canvas.height * 0.72;
      const shimmer = Math.sin(tick * 0.018) * 0.1 + 0.9;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
      glow.addColorStop(0, `rgba(16, 185, 129, ${0.1 * shimmer})`);
      glow.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Floating particles
      particlesRef.current.forEach(p => {
        const flicker = Math.sin(tick * p.speed + p.phase) * 0.3 + 0.7;
        const drift = Math.sin(tick * p.speed * 0.5 + p.phase) * 8;
        ctx.beginPath();
        ctx.arc(p.x + drift, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16, 185, 129, ${p.alpha * flicker * 0.65})`;
        ctx.fill();
      });

      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  // Auto-focus input
  useEffect(() => {
    if (phase === 'question') {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [phase]);

  const handleSubmit = useCallback(async () => {
    if (!incomeInput.trim()) return;
    setPhase('interpreting');
    // Simulate AI parsing
    await new Promise(r => setTimeout(r, 1800));

    const input = incomeInput.trim();
    // Extract number from input
    const numStr = input.replace(/[^0-9.]/g, '');
    let income = parseFloat(numStr);

    // If no number, generate a reasonable estimate
    if (isNaN(income) || income < 500) {
      income = 4500; // default estimate
    }

    // Determine pay frequency
    let payFreq: ParsedSetup['payFrequency'] = 'semi-monthly';
    const lower = input.toLowerCase();
    if (lower.includes('biweekly') || lower.includes('bi-weekly') || lower.includes('every 2 week')) {
      payFreq = 'bi-weekly';
    } else if (lower.includes('weekly')) {
      payFreq = 'weekly';
    } else if (lower.includes('monthly')) {
      payFreq = 'monthly';
    }

    // Calculate estimated obligations (roughly 70% of income)
    const obligations = Math.round(income * 0.7);

    const categories = [
      { name: 'Rent / Mortgage', icon: '🏠', color: '#10b981', monthly_goal: Math.round(obligations * 0.35) },
      { name: 'Groceries', icon: '🛒', color: '#3b82f6', monthly_goal: Math.round(obligations * 0.15) },
      { name: 'Utilities', icon: '⚡', color: '#f59e0b', monthly_goal: Math.round(obligations * 0.10) },
      { name: 'Transportation', icon: '🚗', color: '#6366f1', monthly_goal: Math.round(obligations * 0.10) },
      { name: 'Savings', icon: '🏦', color: '#0ea5e9', monthly_goal: Math.round(obligations * 0.15) },
      { name: 'Personal', icon: '💳', color: '#ec4899', monthly_goal: Math.round(obligations * 0.15) },
    ];

    setParsed({
      incomeAmount: income,
      payFrequency: payFreq,
      estimatedObligations: obligations,
      suggestedCategories: categories,
    });
    setEditedIncome(income.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
    setPhase('preview');
  }, [incomeInput]);

  const handleConfirm = useCallback(async () => {
    if (!parsed) return;
    setPhase('saving');

    await new Promise(r => setTimeout(r, 800));

    try {
      // Save income + pay frequency
      await updateSettings({
        income_amount: parsed.incomeAmount,
        pay_frequency: parsed.payFrequency as string,
        pay_dates: [1, 15],
      });
      // Create suggested buckets
      for (const cat of parsed.suggestedCategories) {
        try {
          await createBucket({
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            monthly_goal: cat.monthly_goal,
          });
        } catch (e) {
          console.warn('[PulseOnboarding] Failed to create bucket:', cat.name, e);
        }
      }
    } catch (e) {
      console.error('[PulseOnboarding] Setup failed:', e);
    }

    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    await new Promise(r => setTimeout(r, 600));
    onComplete();
  }, [parsed, updateSettings, createBucket, onComplete]);

  const pulse = Math.sin(t * 0.04) * 0.3 + 0.7;

  return (
    <div className="pulse-onboard-root">
      <canvas ref={canvasRef} className="pulse-onboard-canvas" />

      {/* Phase: The Question */}
      {phase === 'question' && (
        <div className="pulse-onboard-center">
          <div className="pulse-onboard-prompt-group">
            <div className="pulse-onboard-eyebrow">Welcome to Pulse</div>
            <h1 className="pulse-onboard-question">
              What's your<br />monthly income?
            </h1>
            <p className="pulse-onboard-hint">
              Include all sources. Pulse uses this to build your zero-based budget automatically.
            </p>
          </div>

          <div className="pulse-onboard-input-wrap">
            <div className="pulse-onboard-input-row">
              <span className="pulse-onboard-currency">$</span>
              <input
                ref={inputRef}
                type="text"
                className="pulse-onboard-input"
                placeholder="4,500"
                value={incomeInput}
                onChange={e => setIncomeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoFocus
              />
              <span className="pulse-onboard-period">/ month</span>
            </div>
            <button
              className="pulse-onboard-submit"
              onClick={handleSubmit}
              disabled={!incomeInput.trim()}
            >
              <span>Start Pulse →</span>
            </button>
          </div>

          {/* Example chips */}
          <div className="pulse-onboard-examples">
            {[
              { text: '"$3,200 / month"', icon: '💰' },
              { text: '"$4,500 monthly"', icon: '🏦' },
              { text: '"$2,800 after taxes"', icon: '💸' },
            ].map(ex => (
              <button
                key={ex.text}
                className="pulse-onboard-example-chip"
                onClick={() => { setIncomeInput(ex.text.replace(/"/g, '').replace('$', '').replace('/ month', '').replace(' monthly', '').replace(' after taxes', '')); inputRef.current?.focus(); }}
              >
                <span>{ex.icon}</span>
                <span>{ex.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Phase: Interpreting */}
      {phase === 'interpreting' && (
        <div className="pulse-onboard-center">
          <div className="pulse-onboard-interpreting">
            <div className="pulse-onboard-heart-orb">
              <svg viewBox="0 0 100 100" className="pulse-onboard-heart-svg">
                <path
                  d="M50 88 C20 65, 5 48, 12 32 C17 20, 30 16, 42 24 C47 18, 53 18, 58 24 C70 16, 83 20, 88 32 C95 48, 80 65, 50 88Z"
                  fill="#10b981"
                  className="pulse-onboard-heart-fill"
                />
              </svg>
            </div>
            <p className="pulse-onboard-interpreting-text">
              Analyzing your finances...
            </p>
          </div>
        </div>
      )}

      {/* Phase: Preview Budget */}
      {phase === 'preview' && parsed && (
        <div className="pulse-onboard-center">
          <div className="pulse-onboard-preview">
            {/* Ambient glow */}
            <div
              className="pulse-onboard-card-glow"
              style={{
                background: `radial-gradient(ellipse at 50% 100%, rgba(16,185,129,${pulse * 0.3}) 0%, transparent 65%)`,
              }}
            />

            <div className="pulse-onboard-preview-eyebrow">Your Budget Ready</div>

            {/* Income display */}
            <div className="pulse-onboard-income-display">
              <span className="pulse-onboard-income-label">Monthly Income</span>
              <input
                className="pulse-onboard-income-input"
                value={editedIncome}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setEditedIncome(raw ? `$${parseInt(raw).toLocaleString()}` : '');
                  setParsed(p => p ? { ...p, incomeAmount: parseInt(raw) || 0 } : p);
                }}
              />
              <span className="pulse-onboard-pay-freq">{parsed.payFrequency}</span>
            </div>

            {/* Category preview */}
            <div className="pulse-onboard-categories">
              {parsed.suggestedCategories.map(cat => (
                <div key={cat.name} className="pulse-onboard-cat-row">
                  <span className="pulse-onboard-cat-icon">{cat.icon}</span>
                  <span className="pulse-onboard-cat-name">{cat.name}</span>
                  <span className="pulse-onboard-cat-amount">
                    ${cat.monthly_goal.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <p className="pulse-onboard-desc">
              Pulse zero-bases every dollar. Edit later from Settings.
            </p>

            <button className="pulse-onboard-launch-btn" onClick={handleConfirm}>
              <span>💚 Activate Pulse</span>
            </button>

            <button className="pulse-onboard-retry" onClick={() => { setPhase('question'); setIncomeInput(''); }}>
              Different amount
            </button>
          </div>
        </div>
      )}

      {/* Phase: Saving */}
      {phase === 'saving' && (
        <div className="pulse-onboard-center">
          <div className="pulse-onboard-save">
            <div className="pulse-onboard-save-heart">
              <svg viewBox="0 0 60 60">
                <path
                  d="M30 54 C12 40, 3 29, 7 19 C10 12, 18 10, 25 14 C28 11, 32 11, 35 14 C42 10, 50 12, 53 19 C57 29, 48 40, 30 54Z"
                  fill="#10b981"
                  className="pulse-onboard-save-heart-path"
                />
              </svg>
            </div>
            <p className="pulse-onboard-saving-text">Budget activated.</p>
          </div>
        </div>
      )}
    </div>
  );
}
