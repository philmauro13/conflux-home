// Conflux Home — Kitchen Onboarding (Hearth)
// "The First Meal" — one question, one recipe, the warmth begins.
//
// LocalStorage: 'hearth-onboarding-completed' (permanent — one time only)
//
// Design: deep charcoal + warm amber, heat shimmer canvas,
//         single question → AI parse → recipe card preview → save
//
// Pattern: follows HorizonOnboarding.tsx (constellation card = recipe card here)

import { useState, useEffect, useRef, useCallback } from 'react';
import { useMeals } from '../hooks/useKitchen';
import type { Meal } from '../types';
import '../styles/hearth-onboarding.css';

const ONBOARDING_DONE_KEY = 'hearth-onboarding-completed';

interface ParsedMeal {
  name: string;
  description: string;
  category: string;
  emoji: string;
  cuisine: string;
}

interface Props {
  onComplete: (createdMeal?: Meal) => void;
}

export function hasCompletedHearthOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_DONE_KEY) === 'true';
}

const CUISINE_EMOJI: Record<string, string> = {
  italian: '🇮🇹', mexican: '🇲🇽', asian: '🥢', indian: '🇮🇳',
  american: '🇺🇸', mediterranean: '🫒', japanese: '🇯🇵', thai: '🇹🇭',
  french: '🇫🇷', korean: '🇰🇷', other: '🍽️',
};

const MEAL_EMOJI = ['🍳', '🥗', '🍝', '🌮', '🥘', '🍜', '🥙', '🍲'];

export default function HearthOnboarding({ onComplete }: Props) {
  const { addWithAI } = useMeals();
  const [phase, setPhase] = useState<'question' | 'interpreting' | 'preview' | 'saving'>('question');
  const [mealInput, setMealInput] = useState('');
  const [parsed, setParsed] = useState<ParsedMeal | null>(null);
  const [editedName, setEditedName] = useState('');
  const [flameIntensity, setFlameIntensity] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tRef = useRef(0);

  // Animated background — heat shimmer + floating embers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    let animFrame: number;
    const embers = Array.from({ length: 14 }, (_, i) => ({
      x: canvas.width * (0.15 + Math.random() * 0.7),
      y: canvas.height * (0.5 + Math.random() * 0.3),
      r: Math.random() * 2.5 + 1,
      speed: Math.random() * 0.012 + 0.006,
      phase: Math.random() * Math.PI * 2,
      hue: 28 + Math.random() * 18,
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tRef.current += 1;
      const t = tRef.current;

      // Heat shimmer gradient at bottom
      const heatY = canvas.height * 0.6;
      const shimmer = Math.sin(t * 0.018) * 0.12 + 0.88;
      const heatGrad = ctx.createLinearGradient(0, heatY, 0, canvas.height);
      heatGrad.addColorStop(0, 'rgba(245,158,11,0)');
      heatGrad.addColorStop(0.25, `rgba(245,158,11,${0.035 * shimmer})`);
      heatGrad.addColorStop(0.6, `rgba(239,68,68,${0.05 * shimmer})`);
      heatGrad.addColorStop(1, `rgba(180,83,9,${0.09 * shimmer})`);
      ctx.fillStyle = heatGrad;
      ctx.fillRect(0, heatY, canvas.width, canvas.height - heatY);

      // Heat wave lines
      ctx.strokeStyle = `rgba(245,158,11,0.06)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const baseY = heatY + (i / 4) * (canvas.height - heatY) * 0.55;
        ctx.beginPath();
        for (let x = 0; x < canvas.width; x += 6) {
          const wave = Math.sin((x * 0.018) + (t * 0.025) + i * 1.2) * (3 + i * 2.5);
          i === 0 ? ctx.moveTo(x, baseY + wave) : ctx.lineTo(x, baseY + wave);
        }
        ctx.stroke();
      }

      // Floating embers
      embers.forEach((e, i) => {
        const drift = Math.sin(t * e.speed + e.phase) * 12;
        const rise = ((t * e.speed * 60) % (canvas.height * 0.5));
        const y = canvas.height - heatY - rise;
        if (y < 0) return;
        const alpha = rise < canvas.height * 0.1
          ? rise / (canvas.height * 0.1)
          : 1 - ((rise - canvas.height * 0.1) / (canvas.height * 0.4));
        ctx.beginPath();
        ctx.arc(e.x + drift, y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue}, 90%, 60%, ${alpha * 0.75})`;
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

  // Flame intensity animation (pulsing glow behind card)
  useEffect(() => {
    let frame: number;
    const animate = () => {
      setFlameIntensity(v => {
        const next = v + 0.04;
        return next > 1 ? 0 : next;
      });
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!mealInput.trim()) return;
    setPhase('interpreting');
    // Simulate AI parsing
    await new Promise(r => setTimeout(r, 1800));

    const input = mealInput.toLowerCase();
    let cuisine = 'other';
    let emoji = MEAL_EMOJI[Math.floor(Math.random() * MEAL_EMOJI.length)];

    if (input.includes('pasta') || input.includes('pizza') || input.includes('italian') || input.includes('spaghetti') || input.includes('lasagna')) {
      cuisine = 'italian'; emoji = '🍝';
    } else if (input.includes('taco') || input.includes('burrito') || input.includes('mexican') || input.includes('enchilada') || input.includes('quesadilla')) {
      cuisine = 'mexican'; emoji = '🌮';
    } else if (input.includes('sushi') || input.includes('ramen') || input.includes('stir fry') || input.includes('thai') || input.includes('curry') || input.includes('chinese')) {
      cuisine = 'asian'; emoji = '🍜';
    } else if (input.includes('curry') || input.includes('indian') || input.includes('tandoori') || input.includes('naan')) {
      cuisine = 'indian'; emoji = '🥘';
    } else if (input.includes('salad') || input.includes('greek') || input.includes('mediterranean') || input.includes('hummus')) {
      cuisine = 'mediterranean'; emoji = '🥗';
    } else if (input.includes('steak') || input.includes('burger') || input.includes('american') || input.includes('bbq') || input.includes('grill')) {
      cuisine = 'american'; emoji = '🥙';
    } else if (input.includes('soup') || input.includes('stew') || input.includes('chili') || input.includes('pot roast')) {
      cuisine = 'american'; emoji = '🍲';
    } else if (input.includes('breakfast') || input.includes('pancake') || input.includes('omelette') || input.includes('eggs') || input.includes('french toast')) {
      cuisine = 'american'; emoji = '🍳';
    } else if (input.includes('chicken') || input.includes('roast') || input.includes('fish') || input.includes('salmon')) {
      cuisine = 'american'; emoji = '🍗';
    }

    const name = mealInput.trim().replace(/^(i want to |i made |let's have |i'm craving |i'm making |make me a?)\s+/i, '');
    const capped = name.charAt(0).toUpperCase() + name.slice(1);

    setParsed({
      name: capped,
      description: `A delicious ${cuisine} dish.`,
      category: 'main',
      emoji,
      cuisine,
    });
    setEditedName(capped);
    setPhase('preview');
  }, [mealInput]);

  const handleConfirm = useCallback(async () => {
    if (!parsed) return;
    setPhase('saving');

    await new Promise(r => setTimeout(r, 1200));

    let createdMeal = null;
    try {
      const result = await addWithAI(editedName || parsed.name);
      console.log('[HearthOnboarding] Created meal:', result.meal?.name);
      createdMeal = result.meal;
    } catch (e) {
      console.error('[HearthOnboarding] Failed to create meal:', e);
      // Do NOT trap the user in a loop — proceed to app even if meal creation fails.
    }

    localStorage.setItem(ONBOARDING_DONE_KEY, 'true');
    await new Promise(r => setTimeout(r, 600));
    onComplete(createdMeal ?? undefined);
  }, [parsed, editedName, addWithAI, onComplete]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const pulse = Math.sin(tRef.current * 0.04) * 0.3 + 0.7;
  const cuisineEmoji = parsed ? CUISINE_EMOJI[parsed.cuisine] || '🍽️' : '🍽️';

  return (
    <div className="hearth-onboard-root">
      {/* Animated canvas: heat shimmer + embers */}
      <canvas ref={canvasRef} className="hearth-onboard-canvas" />

      {/* Phase: The Question */}
      {phase === 'question' && (
        <div className="hearth-onboard-center">
          <div className="hearth-onboard-prompt-group">
            <div className="hearth-onboard-eyebrow">Welcome to Hearth</div>
            <h1 className="hearth-onboard-question">
              What would you<br />like to cook?
            </h1>
            <p className="hearth-onboard-hint">
              Tell Hearth your first meal. Any dish, any craving — we'll handle the rest.
            </p>
          </div>

          <div className="hearth-onboard-input-wrap">
            <textarea
              ref={inputRef}
              className="hearth-onboard-input"
              placeholder="e.g., Chicken parmesan with spaghetti..."
              value={mealInput}
              onChange={e => setMealInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              autoFocus
            />
            <button
              className="hearth-onboard-submit"
              onClick={handleSubmit}
              disabled={!mealInput.trim()}
            >
              <span>Ignite the flame</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8 6, 6 10, 8 14 C9 17, 12 20, 12 20 C12 20, 15 17, 16 14 C18 10, 16 6, 12 2Z" fill="currentColor" opacity="0.5"/>
                <path d="M12 2C10 4, 9 7, 10 10 C11 13, 12 16, 12 16 C12 16, 13 13, 14 10 C15 7, 14 4, 12 2Z" fill="currentColor"/>
              </svg>
            </button>
          </div>

          {/* Example chips */}
          <div className="hearth-onboard-examples">
            {[
              { text: '"Grilled salmon with veggies"', icon: '🍣' },
              { text: '"Chicken parmesan"', icon: '🍗' },
              { text: '"Beef tacos"', icon: '🌮' },
            ].map(ex => (
              <button
                key={ex.text}
                className="hearth-onboard-example-chip"
                onClick={() => { setMealInput(ex.text.replace(/"/g, '')); inputRef.current?.focus(); }}
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
        <div className="hearth-onboard-center">
          <div className="hearth-onboard-interpreting">
            <div className="hearth-onboard-flame-orb" />
            <p className="hearth-onboard-interpreting-text">
              Warming up the kitchen...
            </p>
          </div>
        </div>
      )}

      {/* Phase: Preview Recipe Card */}
      {phase === 'preview' && parsed && (
        <div className="hearth-onboard-center">
          <div className="hearth-onboard-preview">
            {/* Flame behind card */}
            <div
              className="hearth-onboard-card-glow"
              style={{
                background: `radial-gradient(ellipse at 50% 80%, rgba(245,158,11,${pulse * 0.35}) 0%, transparent 65%)`,
              }}
            />

            <div className="hearth-onboard-preview-eyebrow">Your Recipe</div>

            {/* Emoji + Recipe visual */}
            <div className="hearth-onboard-recipe-preview">
              <div className="hearth-onboard-recipe-emoji">{parsed.emoji}</div>
              <div className="hearth-onboard-recipe-cuisine">{cuisineEmoji} {parsed.cuisine}</div>
            </div>

            {/* Editable name */}
            <input
              className="hearth-onboard-title-input"
              value={editedName}
              onChange={e => setEditedName(e.target.value)}
              placeholder="Recipe name"
            />

            {/* Description */}
            <p className="hearth-onboard-desc">
              A delicious {parsed.cuisine} dish, ready to cook.
            </p>

            {/* Confirm */}
            <button className="hearth-onboard-launch-btn" onClick={handleConfirm}>
              <span>🔥 Add to my kitchen</span>
            </button>

            <button className="hearth-onboard-retry" onClick={() => { setPhase('question'); setMealInput(''); }}>
              Different dish
            </button>
          </div>
        </div>
      )}

      {/* Phase: Saving */}
      {phase === 'saving' && (
        <div className="hearth-onboard-center">
          <div className="hearth-onboard-save">
            <div className="hearth-onboard-save-flame">
              <svg viewBox="0 0 60 80">
                <path
                  d="M30 75 C10 58, 3 42, 8 28 C11 18, 20 12, 26 18 C29 10, 34 5, 38 12 C44 22, 40 42, 30 55 C25 62, 18 66, 12 64 C6 62, 4 52, 8 42 C12 32, 24 26, 30 26 C36 26, 48 32, 52 42 C56 52, 50 62, 44 64 C38 66, 32 62, 30 55 C18 42, 16 22, 22 12 C28 5, 34 12, 36 18 C42 12, 52 18, 54 28 C60 42, 50 58, 30 75Z"
                  fill="#F59E0B"
                  className="hearth-onboard-save-flame-path"
                />
              </svg>
            </div>
            <p className="hearth-onboard-saving-text">Saved to your kitchen.</p>
          </div>
        </div>
      )}
    </div>
  );
}
