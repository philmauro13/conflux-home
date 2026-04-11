import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { playTourBlip, playWelcomeChime } from '../lib/sound';
import { NeuralBrainScene } from './NeuralBrainScene';
import { COMMANDS } from '../lib/neuralBrain';
import { useAuth } from '../hooks/useAuth';

import '../styles/animations.css';

// ── Types ──

interface OnboardingProps {
  onComplete: (goals: string[], selectedApps: string[]) => void;
}

// ── Key Players for the intro sequence ──

interface KeyPlayer {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  delay: number; // ms after step start
}

const KEY_PLAYERS: KeyPlayer[] = [
  { id: 'conflux', name: 'Conflux', emoji: '🤖', color: '#00d4ff', tagline: 'Your co-founder who never sleeps.', delay: 600 },
  { id: 'helix', name: 'Helix', emoji: '🔬', color: '#00cc88', tagline: 'Research at the speed of thought.', delay: 1800 },
  { id: 'pulse', name: 'pulse', emoji: '💚', color: '#10b981', tagline: 'Your financial heartbeat.', delay: 3000 },
];

// Aegis + Viper appear together as "the protectors"
const PROTECTORS: KeyPlayer[] = [
  { id: 'aegis', name: 'Aegis', emoji: '🛡️', color: '#6366f1', tagline: 'I watch the walls.', delay: 4400 },
  { id: 'viper', name: 'Viper', emoji: '🐍', color: '#22c55e', tagline: 'I find the cracks.', delay: 4400 },
];

// Conflux's narration script (synced with card appearances)
function getNarrationScript(name: string): string {
  return `Hey ${name || 'there'}. I'm Conflux. Let me introduce you to the team. ` +
    `This is Helix — your research powerhouse. ` +
    `And Pulse — your financial heartbeat. ` +
    `Now these two? They protect everything. ` +
    `Aegis watches the walls. Viper finds the cracks before anyone else does. ` +
    `Brother and sister. ` +
    `Together, they've got your back. ` +
    `So — what brought you here?`;
}

// ── Apps for auto-selection ──

interface AppOption {
  id: string;
  name: string;
  emoji: string;
  description: string;
}

const APPS: AppOption[] = [
  { id: 'budget', name: 'Budget', emoji: '💰', description: 'Track expenses and savings' },
  { id: 'kitchen', name: 'Kitchen', emoji: '🍳', description: 'Recipes and meal planning' },
  { id: 'dreams', name: 'Dreams', emoji: '✨', description: 'Goals and aspirations' },
  { id: 'life', name: 'Life', emoji: '🏠', description: 'Daily tasks and organization' },
];

// Auto-select apps based on ice breaker answer
function suggestApps(answer: string): string[] {
  const lower = answer.toLowerCase();
  const picks: string[] = [];

  if (/money|budget|save|spend|financ|income|expense|invest|debt|bill|pay/.test(lower)) picks.push('budget');
  if (/cook|food|meal|recipe|kitchen|diet|eat|grocer|pantry/.test(lower)) picks.push('kitchen');
  if (/goal|dream|learn|want|aspir|plan|build|start|achieve/.test(lower)) picks.push('dreams');
  if (/habit|routine|organiz|task|daily|schedul|time|focus/.test(lower)) picks.push('life');

  // Default: if nothing matched, suggest budget + dreams (everyone needs those)
  if (picks.length === 0) return ['budget', 'dreams'];
  return picks.slice(0, 3); // max 3
}

// ── Heartbeat SVG Component ──

function HeartbeatSVG({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 400 80" style={{ width: '100%', maxWidth: 400, height: 80 }}>
      <path
        d="M0,40 L60,40 L70,40 L80,20 L90,60 L100,10 L110,70 L120,40 L130,40 L200,40 L210,40 L220,20 L230,60 L240,10 L250,70 L260,40 L270,40 L340,40 L350,40 L360,20 L370,60 L380,10 L390,70 L400,40"
        fill="none"
        stroke="var(--accent-primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 800,
          filter: `drop-shadow(0 0 6px var(--accent-primary))`,
          animation: active ? 'heartbeat-draw 2s linear infinite' : 'none',
        }}
      />
    </svg>
  );
}

// ── Particles Component ──

function Particles({ count = 15 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    left: `${5 + Math.random() * 90}%`,
    size: 2 + Math.random() * 2,
    duration: 4 + Math.random() * 4,
    delay: Math.random() * 3,
    opacity: 0.15 + Math.random() * 0.25,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            bottom: '-4px',
            left: p.left,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            opacity: p.opacity,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ── Progress Bar Component ──

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      padding: '20px 0 0',
      flexShrink: 0,
    }}>
      {[0, 1, 2, 3].map(i => {
        const isActive = i === step;
        const isDone = i < step;
        return (
          <motion.div
            key={i}
            animate={{
              width: isActive ? 32 : 10,
              backgroundColor: isDone || isActive ? 'var(--accent-primary)' : 'var(--border)',
              opacity: isDone || isActive ? 1 : 0.4,
            }}
            transition={{ duration: 0.3 }}
            style={{
              width: isActive ? 32 : 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isDone || isActive ? 'var(--accent-primary)' : 'var(--border)',
              opacity: isDone || isActive ? 1 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Agent Card (for key player intros) ──

function AgentIntroCard({ player, visible }: { player: KeyPlayer; visible: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.85 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.85 }}
      transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        width: 120,
      }}
    >
      <div style={{
        width: 64,
        height: 64,
        borderRadius: 20,
        background: `${player.color}15`,
        border: `2px solid ${player.color}33`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 32,
        filter: `drop-shadow(0 0 12px ${player.color}44)`,
        transition: 'all 0.3s ease',
      }}>
        {player.emoji}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: player.color }}>
        {player.name}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', lineHeight: 1.3, textAlign: 'center' }}>
        {player.tagline}
      </div>
    </motion.div>
  );
}

// ── Main Component ──

/**
 * Onboarding Component — Narrative Flow
 *
 * Steps:
 * 0. "Who Are You?" — Name input + heartbeat + neural brain
 * 1. "Conflux Speaks" — Conflux introduces the team via TTS
 * 2. "Meet the Key Players" — Agents appear sequentially (Conflux, Helix, Pulse, Aegis+Viper)
 * 3. "What Do You Need?" — Ice breaker question, answer persists to profile
 * 4. "Building Your World" — Auto-select apps, animate setup, done
 *
 * @param onComplete - Callback with selected apps when flow completes
 */
export default function Onboarding({ onComplete }: OnboardingProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);

  // Step 0: Name
  const [userName, setUserName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [heartbeatActive, setHeartbeatActive] = useState(false);

  // Step 1-2: Agent intro
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [visibleAgents, setVisibleAgents] = useState<Set<string>>(new Set());
  const [showProtectors, setShowProtectors] = useState(false);
  const narrationTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Step 3: Ice breaker
  const [iceBreakerInput, setIceBreakerInput] = useState('');

  // Step 4: Building world
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildPhase, setBuildPhase] = useState<'selecting' | 'building' | 'done'>('selecting');
  const [suggestedApps, setSuggestedApps] = useState<string[]>([]);

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);

  // Play base64 MP3 audio via Web Audio API
  const playBase64Audio = useCallback((base64: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer).then((buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onended = () => resolve();
        source.start(0);
      }).catch(reject);
    });
  }, []);

  // TTS narration
  const speakNarration = useCallback(async () => {
    const text = getNarrationScript(userName);
    setIsSpeaking(true);
    try {
      const result = await invoke<{ audio_base64: string }>('tts_speak', { text, voice: 'Conflux' });
      await playBase64Audio(result.audio_base64);
    } catch (err) {
      console.warn('[Onboarding] TTS failed (non-fatal):', err);
    } finally {
      setIsSpeaking(false);
    }
  }, [userName, playBase64Audio]);

  // TTS for ice breaker question
  const speakIceBreaker = useCallback(async () => {
    const text = `So — what brought you here? What's the first thing you need help with?`;
    try {
      const result = await invoke<{ audio_base64: string }>('tts_speak', { text, voice: 'Conflux' });
      await playBase64Audio(result.audio_base64);
    } catch (err) {
      console.warn('[Onboarding] Ice breaker TTS failed (non-fatal):', err);
    }
  }, [playBase64Audio]);

  // Load persisted name
  useEffect(() => {
    const savedName = localStorage.getItem('conflux-name');
    if (savedName) setUserName(savedName);
  }, []);

  // Play welcome chime on mount
  useEffect(() => {
    playWelcomeChime();
  }, []);

  // Always dark mode
  useEffect(() => {
    document.body.classList.add('dark');
  }, []);

  // Step 1: Start narration + staggered agent appearances
  useEffect(() => {
    if (step !== 1) return;

    // Start TTS narration
    speakNarration();

    // Stagger agent card appearances
    KEY_PLAYERS.forEach(player => {
      const timer = setTimeout(() => {
        setVisibleAgents(prev => new Set([...prev, player.id]));
      }, player.delay);
      narrationTimerRef.current.push(timer);
    });

    // Show protectors (Aegis + Viper) after the main three
    const protectorTimer = setTimeout(() => {
      setShowProtectors(true);
      PROTECTORS.forEach(p => {
        setVisibleAgents(prev => new Set([...prev, p.id]));
      });
    }, 4200);
    narrationTimerRef.current.push(protectorTimer);

    return () => {
      narrationTimerRef.current.forEach(clearTimeout);
      narrationTimerRef.current = [];
    };
  }, [step, speakNarration]);

  // Step 3: Speak ice breaker prompt
  useEffect(() => {
    if (step === 3) {
      speakIceBreaker();
    }
  }, [step, speakIceBreaker]);

  // Navigation
  const goToStep = useCallback((nextStep: number) => {
    playTourBlip();
    setAnimating(true);
    setTimeout(() => {
      setStep(nextStep);
      setTimeout(() => setAnimating(false), 400);
    }, 300);
  }, []);

  const nextStep = () => {
    if (step === 0 && userName.trim().length > 0) {
      localStorage.setItem('conflux-name', userName.trim());
    }
    goToStep(step + 1);
  };

  const prevStep = () => goToStep(step - 1);

  // Enter key on name input
  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && userName.trim().length > 0) {
      nextStep();
    }
  };

  // Finish onboarding — auto-select apps and build
  const handleFinish = useCallback(async () => {
    const apps = suggestApps(iceBreakerInput);
    setSuggestedApps(apps);
    setBuildPhase('building');

    // Animate progress
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    for (let p = 0; p <= 100; p += 2) {
      setBuildProgress(Math.min(p, 100));
      await delay(20);
    }

    setBuildPhase('done');
    await delay(600);

    // Save and complete
    localStorage.setItem('conflux-onboarded', 'true');
    localStorage.setItem('conflux-name', userName.trim() || 'there');
    localStorage.setItem('conflux-setup-apps', JSON.stringify(apps));

    // Persist ice breaker answer to profile if user is logged in
    if (user && iceBreakerInput.trim()) {
      try {
        await import('../lib/supabase').then(({ supabase }) => {
          supabase.from('ch_profiles').upsert({
            id: user.id,
            onboarding_goals: [iceBreakerInput.trim()],
          });
        });
      } catch (err) {
        console.warn('[Onboarding] Failed to persist ice breaker answer:', err);
      }
    }

    onComplete([], apps);
  }, [iceBreakerInput, userName, user, onComplete]);

  // ── Render Steps ──

  // Step 0: "Who Are You?"
  const renderNameStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      style={{ textAlign: 'center', maxWidth: 420, width: '100%', margin: '0 auto', position: 'relative' }}
    >
      <Particles count={15} />

      <div style={{ marginBottom: 24 }}>
        <img src="/logo.png" alt="Conflux Home" style={{ width: 96, height: 96, objectFit: 'contain' }} />
      </div>

      <h1 style={{
        fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px',
        color: 'var(--text-primary)', marginBottom: 12,
      }}>
        Welcome to Conflux Home
      </h1>

      <p style={{ fontSize: 17, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.5 }}>
        Your AI family is about to come alive.
      </p>

      <div style={{ marginBottom: 24 }}>
        <NeuralBrainScene command={COMMANDS[0]} pulseImpulse={5} transparent={true} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <HeartbeatSVG active={heartbeatActive} />
      </div>

      <input
        type="text"
        placeholder="What's your name?"
        value={userName}
        onChange={e => setUserName(e.target.value)}
        onKeyDown={handleNameKeyDown}
        onFocus={() => { setIsTyping(true); setHeartbeatActive(true); }}
        onBlur={() => { setIsTyping(false); setHeartbeatActive(false); }}
        style={{
          width: '100%', maxWidth: 280, padding: '12px 16px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--bg-primary)',
          color: 'var(--text-primary)', fontSize: 16, textAlign: 'center',
          outline: 'none', boxSizing: 'border-box',
        }}
        autoFocus
      />

      {userName && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ marginTop: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
          Press <kbd style={{
            padding: '2px 8px', borderRadius: 4, background: 'var(--bg-card)',
            border: '1px solid var(--border)', fontSize: 12,
          }}>Enter</kbd> to continue
        </motion.p>
      )}
    </motion.div>
  );

  // Step 1: "Conflux Speaks" + Step 2: "Meet the Key Players" (combined into one screen)
  const renderTeamIntroStep = () => (
    <motion.div
      key="step-team-intro"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        maxWidth: 800, width: '100%', textAlign: 'center', position: 'relative',
      }}
    >
      {/* Neural brain pulsing during narration */}
      <div style={{ position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)' }}>
        <NeuralBrainScene
          command={isSpeaking ? COMMANDS[3] : COMMANDS[1]}
          pulseImpulse={isSpeaking ? 20 : 8}
          transparent={true}
        />
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: '2rem', fontWeight: 700,
          background: 'linear-gradient(135deg, #00d4ff, #6366f1, #22c55e)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 8, marginTop: 60,
        }}
      >
        Meet Your Team
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: 40, maxWidth: 500 }}
      >
        {userName ? `${userName},` : ''} each one has a specialty. Together, they're unstoppable.
      </motion.p>

      {/* Main agents row */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 24, flexWrap: 'wrap',
      }}>
        {KEY_PLAYERS.map(player => (
          <AgentIntroCard
            key={player.id}
            player={player}
            visible={visibleAgents.has(player.id)}
          />
        ))}
      </div>

      {/* Divider + "the protectors" label */}
      <AnimatePresence>
        {showProtectors && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              color: 'var(--text-tertiary)', fontSize: '0.8rem',
              textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600,
            }}>
              <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
              And these two? They protect everything.
              <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 32 }}>
              {PROTECTORS.map(player => (
                <AgentIntroCard
                  key={player.id}
                  player={player}
                  visible={visibleAgents.has(player.id)}
                />
              ))}
            </div>

            {/* Brother & sister label */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}
            >
              Brother and sister. They've got your back.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Continue button — appears after narration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isSpeaking ? 0 : 1 }}
        transition={{ duration: 0.4 }}
        style={{ marginTop: 40 }}
      >
        <button
          onClick={nextStep}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: 'var(--accent-primary)', color: 'white',
            border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {isSpeaking ? '🎙️ Conflux is speaking...' : 'What do you need? →'}
        </button>
      </motion.div>
    </motion.div>
  );

  // Step 3: "What Do You Need?" — Ice Breaker
  const renderIceBreakerStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      style={{ textAlign: 'center', maxWidth: 520, width: '100%', margin: '0 auto', position: 'relative' }}
    >
      {/* Conflux brain in background */}
      <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)' }}>
        <NeuralBrainScene command={COMMANDS[1]} pulseImpulse={6} transparent={true} />
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 60 }}>
        👋 Hey {userName || 'there'}!
      </h1>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
      }}>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
          What's on your mind today? What do you need help with?
        </p>

        <textarea
          value={iceBreakerInput}
          onChange={e => setIceBreakerInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && iceBreakerInput.trim()) {
              e.preventDefault();
              handleFinish();
            }
          }}
          placeholder="e.g. I want to save money and learn to cook..."
          rows={3}
          style={{
            width: '100%', padding: '16px', borderRadius: 12,
            border: '1px solid var(--border)', background: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 16, outline: 'none',
            resize: 'none', marginBottom: 16, boxSizing: 'border-box',
          }}
        />

        <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          This helps us personalize your experience
        </p>
      </div>

      <div style={{ marginTop: 32 }}>
        <button
          onClick={handleFinish}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: iceBreakerInput.trim() ? 'var(--accent-primary)' : 'var(--bg-card)',
            color: iceBreakerInput.trim() ? 'white' : 'var(--text-secondary)',
            border: iceBreakerInput.trim() ? 'none' : '1px solid var(--border)',
            fontSize: 16, fontWeight: 600, cursor: 'pointer',
            opacity: iceBreakerInput.trim() ? 1 : 0.6,
            transition: 'all 0.2s ease',
          }}
        >
          Let's Build →
        </button>
      </div>
    </motion.div>
  );

  // Step 4: "Building Your World"
  const renderBuildStep = () => {
    const buildLabels: Record<string, string> = {
      budget: 'Setting up your Budget',
      kitchen: 'Stocking your Kitchen',
      dreams: 'Creating your Dreams board',
      life: 'Organizing your Life',
    };

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          maxWidth: 480, width: '100%', textAlign: 'center',
        }}
      >
        {/* Neural brain active during build */}
        <div style={{ marginBottom: 32 }}>
          <NeuralBrainScene
            command={buildPhase === 'done' ? COMMANDS[2] : COMMANDS[4]}
            pulseImpulse={buildPhase === 'done' ? 5 : 12 + (buildProgress / 10) * 3}
            transparent={true}
          />
        </div>

        <AnimatePresence mode="wait">
          {buildPhase === 'selecting' && (
            <motion.div key="selecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                Based on what you told us...
              </h2>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
                {suggestApps(iceBreakerInput).map(appId => {
                  const app = APPS.find(a => a.id === appId);
                  return app ? (
                    <div key={appId} style={{
                      padding: '10px 20px', borderRadius: 12,
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
                    }}>
                      {app.emoji} {app.name}
                    </div>
                  ) : null;
                })}
              </div>
            </motion.div>
          )}

          {buildPhase === 'building' && (
            <motion.div key="building" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 32 }}>
                Building your world...
              </h2>

              {/* App progress icons */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 32 }}>
                {suggestedApps.map((appId, i) => {
                  const app = APPS.find(a => a.id === appId);
                  const threshold = ((i + 1) / suggestedApps.length) * 100;
                  const isDone = buildProgress >= threshold;
                  return (
                    <motion.div
                      key={appId}
                      animate={{
                        scale: isDone ? 1 : 0.85,
                        opacity: isDone ? 1 : 0.4,
                      }}
                      transition={{ duration: 0.3 }}
                      style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: isDone ? '#10b981' : 'var(--bg-card)',
                        border: `2px solid ${isDone ? '#10b981' : 'var(--border)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, transition: 'all 0.3s ease',
                      }}
                    >
                      {app?.emoji}
                    </motion.div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 20, padding: 6, marginBottom: 16,
              }}>
                <motion.div
                  animate={{ width: `${buildProgress}%` }}
                  transition={{ duration: 0.15 }}
                  style={{
                    height: 8, borderRadius: 16,
                    background: 'linear-gradient(90deg, var(--accent-primary), #22c55e)',
                    width: `${buildProgress}%`,
                  }}
                />
              </div>

              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {buildProgress < 50 ? 'Setting things up...' : buildProgress < 90 ? 'Almost there...' : 'Done! ✨'}
              </p>
            </motion.div>
          )}

          {buildPhase === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, type: 'spring' }}
            >
              <h2 style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                ✨ Your team is ready.
              </h2>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
                Welcome home, {userName || 'there'}.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  // Step router
  const renderStep = () => {
    switch (step) {
      case 0: return renderNameStep();
      case 1: return renderTeamIntroStep();
      case 2: return renderIceBreakerStep();
      case 3: return renderBuildStep();
      default: return null;
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', width: '100%', background: 'var(--bg-primary)',
    }}>
      {/* Progress Bar — only show during name + team intro + ice breaker */}
      {step < 3 && <ProgressBar step={step} />}

      {/* Content Area */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px', overflow: 'auto',
      }}>
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation — only for steps 0 and 1 */}
      {step < 2 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px 28px', flexShrink: 0,
        }}>
          <div>
            {step > 0 && (
              <button onClick={prevStep} style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 10,
                padding: '10px 20px', color: 'var(--text-secondary)', fontSize: 14,
                fontWeight: 500, cursor: 'pointer',
              }}>
                ← Back
              </button>
            )}
          </div>

          {step === 0 && (
            <button
              className="next-btn"
              onClick={nextStep}
              disabled={userName.trim().length === 0}
              style={{
                width: 'auto', padding: '10px 28px',
                opacity: userName.trim().length === 0 ? 0.5 : 1,
                cursor: userName.trim().length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Get Started
            </button>
          )}
        </div>
      )}
    </div>
  );
}
