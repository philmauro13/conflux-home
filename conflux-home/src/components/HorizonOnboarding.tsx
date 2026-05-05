// Conflux Home — Horizon Onboarding
// "The First Horizon" — one profound question, one dream, one star ignites
//
// LocalStorage: 'horizon-onboarding-completed' (permanent — one time only)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useDreams } from '../hooks/useDreams';
import type { Dream } from '../types';
import '../styles/horizon-onboarding.css';

const ONBOARDING_DONE_KEY = 'horizon-onboarding-completed';

const CATEGORY_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  housing:    { emoji: '🏠', color: '#3b82f6', label: 'Housing' },
  education:  { emoji: '🎓', color: '#8b5cf6', label: 'Education' },
  health:     { emoji: '💪', color: '#10b981', label: 'Health' },
  career:     { emoji: '💼', color: '#f59e0b', label: 'Career' },
  travel:     { emoji: '✈️', color: '#06b6d4', label: 'Travel' },
  family:     { emoji: '👨‍👩‍👧‍👦', color: '#ec4899', label: 'Family' },
  personal:   { emoji: '🌟', color: '#f97316', label: 'Personal' },
  financial:  { emoji: '💰', color: '#14b8a6', label: 'Financial' },
  creative:   { emoji: '🎨', color: '#a855f7', label: 'Creative' },
};

export function hasCompletedHorizonOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

interface ParsedDream {
  title: string;
  category: keyof typeof CATEGORY_CONFIG;
  emoji: string;
  targetDate: string;
}

interface Props {
  onComplete: (createdDream?: Dream) => void;
}

export default function HorizonOnboarding({ onComplete }: Props) {
  const { addDream } = useDreams();
  const [phase, setPhase] = useState<'question' | 'interpreting' | 'preview' | 'launching'>('question');
  const [dreamInput, setDreamInput] = useState('');
  const [parsed, setParsed] = useState<ParsedDream | null>(null);
  const [editedTitle, setEditedTitle] = useState('');
  const [starPosition, setStarPosition] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<{ x: number; y: number; r: number; alpha: number; speed: number; twinkle: number }[]>([]);

  // Initialize background stars
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      starsRef.current = Array.from({ length: 250 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.6 + 0.4,
        speed: Math.random() * 0.02 + 0.005,
        twinkle: Math.random() * Math.PI * 2,
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    let animFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      t += 1;
      starsRef.current.forEach(star => {
        const flicker = Math.sin(t * star.speed + star.twinkle) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha * flicker})`;
        ctx.fill();
      });
      // Extra bright star at top center (the "first star" after launch)
      if (starPosition) {
        const pulse = Math.sin(t * 0.05) * 0.3 + 0.7;
        ctx.beginPath();
        ctx.arc(starPosition.x, starPosition.y, 5, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(starPosition.x, starPosition.y, 0, starPosition.x, starPosition.y, 20);
        grad.addColorStop(0, `rgba(251, 191, 36, ${pulse})`);
        grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(starPosition.x, starPosition.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 191, 36, ${pulse})`;
        ctx.fill();
      }
      animFrame = requestAnimationFrame(animate);
    };
    animFrame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animFrame);
      window.removeEventListener('resize', resize);
    };
  }, [starPosition]);

  // Auto-focus input
  useEffect(() => {
    if (phase === 'question') {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [phase]);

  const handleSubmit = useCallback(async () => {
    if (!dreamInput.trim()) return;

    setPhase('interpreting');

    // Simulate AI parsing — in the future this calls the engine
    await new Promise(r => setTimeout(r, 1800));

    // Parse the dream input into a structured Constellation Card
    const input = dreamInput.toLowerCase();

    let category: keyof typeof CATEGORY_CONFIG = 'personal';
    let emoji = '✨';
    let targetYear = new Date().getFullYear() + 1;
    let targetMonth = '12-31';

    if (input.includes('marathon') || input.includes('run') || input.includes('fitness') || input.includes('gym') || input.includes('weight') || input.includes('health')) {
      category = 'health'; emoji = '💪'; targetMonth = '06-30';
    } else if (input.includes('spanish') || input.includes('french') || input.includes('language') || input.includes('degree') || input.includes('college') || input.includes('school') || input.includes('course') || input.includes('learn')) {
      category = 'education'; emoji = '🎓'; targetMonth = '08-31';
    } else if (input.includes('business') || input.includes('startup') || input.includes('company') || input.includes('entrepreneur') || input.includes('saas') || input.includes('app')) {
      category = 'career'; emoji = '💼'; targetMonth = '12-31';
    } else if (input.includes('house') || input.includes('home') || input.includes('apartment') || input.includes('mortgage') || input.includes('buy')) {
      category = 'housing'; emoji = '🏠'; targetYear = new Date().getFullYear() + 3; targetMonth = '12-31';
    } else if (input.includes('trip') || input.includes('japan') || input.includes('travel') || input.includes('europe') || input.includes('vacation') || input.includes('beach') || input.includes('island')) {
      category = 'travel'; emoji = '✈️'; targetMonth = '09-30';
    } else if (input.includes('save') || input.includes('investment') || input.includes('money') || input.includes('passive') || input.includes('retire') || input.includes('financial')) {
      category = 'financial'; emoji = '💰'; targetYear = new Date().getFullYear() + 5; targetMonth = '12-31';
    } else if (input.includes('write') || input.includes('book') || input.includes('novel') || input.includes('music') || input.includes('art') || input.includes('paint') || input.includes('creative')) {
      category = 'creative'; emoji = '🎨'; targetMonth = '12-31';
    } else if (input.includes('family') || input.includes('kids') || input.includes('child') || input.includes('marriage') || input.includes('wedding')) {
      category = 'family'; emoji = '👨‍👩‍👧‍👦'; targetMonth = '12-31';
    } else if (input.includes('promotion') || input.includes('career') || input.includes('job') || input.includes('salary') || input.includes('interview')) {
      category = 'career'; emoji = '💼'; targetMonth = '06-30';
    }

    // Clean up the title
    const title = dreamInput.trim().replace(/^(i want to|i'm going to|i will|my goal is to|i'm|i am)\s+/i, '');
    const capped = title.charAt(0).toUpperCase() + title.slice(1);

    const parsedDream: ParsedDream = {
      title: capped,
      category,
      emoji,
      targetDate: `${targetYear}-${targetMonth}`,
    };

    setParsed(parsedDream);
    setEditedTitle(capped);
    setPhase('preview');
  }, [dreamInput]);

  const handleConfirm = useCallback(async () => {
    if (!parsed) return;
    setPhase('launching');

    // Place the star in the sky (random position in upper half)
    const x = window.innerWidth * (0.3 + Math.random() * 0.4);
    const y = window.innerHeight * (0.15 + Math.random() * 0.25);
    setStarPosition({ x, y });

    await new Promise(r => setTimeout(r, 1200));

    // Actually create the dream in the DB
    let createdDream: Dream | undefined;
    try {
      createdDream = await addDream(
        crypto.randomUUID(),
        editedTitle || parsed.title,
        null,
        parsed.category,
        parsed.targetDate,
        undefined  // member_id — use auth context user_id via hook
      );
    } catch (e) {
      console.error('Failed to create dream:', e);
    }

    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    await new Promise(r => setTimeout(r, 800));
    onComplete(createdDream);
  }, [parsed, editedTitle, addDream, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const catConfig = parsed ? CATEGORY_CONFIG[parsed.category] : null;

  return (
    <div className="horizon-onboard-root">
      {/* Animated starfield */}
      <canvas ref={canvasRef} className="horizon-onboard-canvas" />

      {/* The horizon line glow */}
      <div className="horizon-onboard-horizon" />

      {/* Phase: The Question */}
      {phase === 'question' && (
        <div className="horizon-onboard-center">
          <div className="horizon-onboard-prompt-group">
            <div className="horizon-onboard-eyebrow">Welcome to Horizon</div>
            <h1 className="horizon-onboard-question">
              What horizon<br />calls to you?
            </h1>
            <p className="horizon-onboard-hint">
              Type your dream. Any dream. We'll light the way.
            </p>
          </div>

          <div className="horizon-onboard-input-wrap">
            <textarea
              ref={inputRef}
              className="horizon-onboard-input"
              placeholder="e.g. Run a marathon, learn Spanish, build my own company..."
              value={dreamInput}
              onChange={e => setDreamInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              autoFocus
            />
            <button
              className="horizon-onboard-submit"
              onClick={handleSubmit}
              disabled={!dreamInput.trim()}
            >
              <span>Light the star</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
              </svg>
            </button>
          </div>

          {/* Floating example dreams */}
          <div className="horizon-onboard-examples">
            {[
              { text: '"Run a marathon"', icon: '💪' },
              { text: '"Learn Spanish"', icon: '🎓' },
              { text: '"Build a startup"', icon: '💼' },
            ].map(ex => (
              <button
                key={ex.text}
                className="horizon-onboard-example-chip"
                onClick={() => { setDreamInput(ex.text.replace(/"/g, '')); inputRef.current?.focus(); }}
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
        <div className="horizon-onboard-center">
          <div className="horizon-onboard-interpreting">
            <div className="horizon-onboard-star-orb" />
            <p className="horizon-onboard-interpreting-text">
              Charting your constellation...
            </p>
          </div>
        </div>
      )}

      {/* Phase: Preview the Constellation Card */}
      {phase === 'preview' && parsed && catConfig && (
        <div className="horizon-onboard-center">
          <div className="horizon-onboard-preview">
            <div className="horizon-onboard-preview-eyebrow">Your Constellation</div>

            {/* Star preview */}
            <div className="horizon-onboard-star-preview">
              <svg viewBox="0 0 60 60" className="horizon-onboard-star-svg">
                <defs>
                  <radialGradient id="starGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={catConfig.color} stopOpacity="1" />
                    <stop offset="100%" stopColor={catConfig.color} stopOpacity="0.3" />
                  </radialGradient>
                </defs>
                <circle cx="30" cy="30" r="20" fill={`url(#starGrad)`} className="horizon-onboard-star-pulse" />
                <circle cx="30" cy="30" r="8" fill={catConfig.color} />
                <circle cx="30" cy="30" r="12" fill="none" stroke={catConfig.color} strokeWidth="1" opacity="0.5" />
              </svg>
              <div className="horizon-onboard-star-glow" style={{ background: catConfig.color }} />
            </div>

            {/* Editable title */}
            <input
              className="horizon-onboard-title-input"
              value={editedTitle}
              onChange={e => setEditedTitle(e.target.value)}
              placeholder="Dream title"
            />

            {/* Category + timeline */}
            <div className="horizon-onboard-meta">
              <span className="horizon-onboard-category-badge" style={{ borderColor: catConfig.color, color: catConfig.color }}>
                {catConfig.emoji} {catConfig.label}
              </span>
              <span className="horizon-onboard-target">
                Target: {new Date(parsed.targetDate).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>

            {/* Confirm */}
            <button className="horizon-onboard-launch-btn" onClick={handleConfirm}>
              <span>Ignite this star</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor"/>
              </svg>
            </button>

            <button className="horizon-onboard-retry" onClick={() => { setPhase('question'); setDreamInput(''); }}>
              Different dream
            </button>
          </div>
        </div>
      )}

      {/* Phase: Launching */}
      {phase === 'launching' && (
        <div className="horizon-onboard-center">
          <div className="horizon-onboard-launching">
            <div className="horizon-onboard-launching-star">
              <svg viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="35" fill="none" stroke="rgba(251,191,36,0.3)" strokeWidth="1" className="horizon-onboard-launch-ring horizon-onboard-launch-ring-1" />
                <circle cx="40" cy="40" r="28" fill="none" stroke="rgba(251,191,36,0.5)" strokeWidth="1" className="horizon-onboard-launch-ring horizon-onboard-launch-ring-2" />
                <circle cx="40" cy="40" r="8" fill="#fbbf24" className="horizon-onboard-launch-core" />
              </svg>
            </div>
            <p className="horizon-onboard-launching-text">Your star is born.</p>
          </div>
        </div>
      )}
    </div>
  );
}
