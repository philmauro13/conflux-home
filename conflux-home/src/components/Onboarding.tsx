import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import {
  playWelcomeChime,
  playBootUp,
  playTourBlip,
  playTeamAlive,
} from '../lib/sound';
import {
  playNarrationSignal,
  playAgentAppear,
  playBrainActivate,
  playLogoReveal,
  playBuildComplete,
  playVoiceClick,
  playTeamAliveNew,
} from '../lib/onboarding-sounds';
import { NeuralBrainScene } from './NeuralBrainScene';
import { COMMANDS } from '../lib/neuralBrain';
import { useAuth } from '../hooks/useAuth';
import type { AgentProfile } from '../data/agent-descriptions';

import '../styles/animations.css';

// ── Types ──

interface OnboardingProps {
  onComplete: (goals: string[], selectedApps: string[]) => void;
}

// ── Agent Voice ID Map (ElevenLabs) ──
// Don configured these on 2026-04-29
// Conflux voice = ELEVENLABS_VOICE_ID from .env (TvxTBL9RtGW6tVhl4NoI)
const AGENT_VOICE_IDS: Record<string, string> = {
  conflux: 'TvxTBL9RtGW6tVhl4NoI', // From .env ELEVENLABS_VOICE_ID
  helix:   'NQMJRVvPew6HsaebYnZj',
  pulse:   'iLVmqjzCGGvqtMCk6vVQ',
  hearth:  'W7iR5kTNHozpIl2Jqq15',
  echo:    'EST9Ui6982FZPSi7gCHi',
  aegis:   'WtA85syCrJwasGeHGH2p',
  viper:   'Mtmp3KhFIjYpWYRycDe3',
};

// ── Key Players for the intro sequence ──

interface KeyPlayer {
  id: string;
  name: string;
  emoji: string;
  color: string;
  tagline: string;
  voiceLine: string;        // short 5-8 word line for voice button
  delay: number;             // ms after step start for card appearance
  narrative?: string;         // Conflux's intro line for this agent
}

const KEY_PLAYERS: KeyPlayer[] = [
  {
    id: 'conflux',
    name: 'Conflux',
    emoji: '🤖',
    color: '#00d4ff',
    tagline: 'Your co-founder who never sleeps.',
    voiceLine: 'Online. Ready to build.',
    delay: 800,
    narrative: 'I\'m the one who brought us all together.',
  },
  {
    id: 'helix',
    name: 'Helix',
    emoji: '🔬',
    color: '#00cc88',
    tagline: 'Research at the speed of thought.',
    voiceLine: 'I find the signal in the noise.',
    delay: 4500,
    narrative: 'Helix — my research powerhouse. Dives deeper than you thought possible.',
  },
  {
    id: 'pulse',
    name: 'Pulse',
    emoji: '💚',
    color: '#10b981',
    tagline: 'Your financial heartbeat.',
    voiceLine: 'Let\'s make your money move smarter.',
    delay: 6500,
    narrative: 'Pulse — your financial heartbeat. Knows your numbers better than you do.',
  },
  {
    id: 'hearth',
    name: 'Hearth',
    emoji: '🍳',
    color: '#f59e0b',
    tagline: 'Your personal nutritionist.',
    voiceLine: 'Good food. Good fuel. Let\'s cook.',
    delay: 8500,
    narrative: 'Hearth — your personal nutritionist. Turns "what\'s for dinner" into a plan.',
  },
  {
    id: 'echo',
    name: 'Echo',
    emoji: '🫂',
    color: '#a78bfa',
    tagline: 'Your wellbeing coach.',
    voiceLine: 'I\'m here. However you\'re doing.',
    delay: 11500,
    narrative: 'Echo — your wellbeing coach. Checks in on the human behind the screen.',
  },
];

// Aegis + Viper appear together as "the protectors"
const PROTECTORS: KeyPlayer[] = [
  {
    id: 'aegis',
    name: 'Aegis',
    emoji: '🛡️',
    color: '#6366f1',
    tagline: 'I watch the walls.',
    voiceLine: 'Your fortress is my responsibility.',
    delay: 14500,
    narrative: 'And these two? They protect everything.',
  },
  {
    id: 'viper',
    name: 'Viper',
    emoji: '🐍',
    color: '#22c55e',
    tagline: 'I find the cracks.',
    voiceLine: 'I break things so nothing breaks you.',
    delay: 14500,
    narrative: 'Aegis watches the walls. Viper finds the cracks before anyone else does.',
  },
];

// Conflux's full narration script (synced with card appearances)
function getNarrationScript(name: string): string {
  return `Hey ${name || 'there'}. Welcome to Conflux Home. ` +
    `I'm the one who brought us all together. ` +
    `This is Helix — my research powerhouse. ` +
    `Pulse — your financial heartbeat. ` +
    `Hearth — your personal nutritionist. ` +
    `And Echo — your wellbeing coach. ` +
    `Oh, and these two? They protect everything. ` +
    `Aegis watches the walls. Viper finds the cracks before anyone else does. ` +
    `Brother and sister. They've got your back. ` +
    `So — what brought you here? What's the first thing you need help with?`;
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
  if (/cook|food|meal|recipe|kitchen|diet|eat|grocer|pantry|nutrit/.test(lower)) picks.push('kitchen');
  if (/goal|dream|learn|want|aspir|plan|build|start|achieve/.test(lower)) picks.push('dreams');
  if (/habit|routine|organiz|task|daily|schedul|time|focus/.test(lower)) picks.push('life');

  // Default: if nothing matched, suggest budget + kitchen + dreams
  if (picks.length === 0) return ['budget', 'kitchen', 'dreams'];
  return picks.slice(0, 3);
}

// ── Particles Component (Conflux-themed: cyan + purple) ──

function Particles({ count = 18, color = '#00d4ff' }: { count?: number; color?: string }) {
  const particles = useMemo(() =>
    Array.from({ length: count }, () => ({
      left: `${3 + Math.random() * 94}%`,
      size: 1.5 + Math.random() * 2.5,
      duration: 5 + Math.random() * 6,
      delay: Math.random() * 4,
      opacity: 0.1 + Math.random() * 0.3,
      drift: (Math.random() - 0.5) * 40,
    })), [count]
  );

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
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
            background: color,
            opacity: p.opacity,
            animation: `float ${p.duration}s ease-in-out ${p.delay}s infinite`,
            '--dx': `${p.drift}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ── Conflux Logo Reveal Component ──

function LogoReveal({ visible }: { visible: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, filter: 'blur(12px)' }}
      animate={visible
        ? { opacity: 1, scale: 1, filter: 'blur(0px)' }
        : { opacity: 0, scale: 0.3, filter: 'blur(12px)' }
      }
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}
    >
      <img
        src="/logo.png"
        alt="Conflux Home"
        style={{
          width: 120,
          height: 120,
          objectFit: 'contain',
          filter: 'drop-shadow(0 0 32px rgba(0,212,255,0.6)) drop-shadow(0 0 64px rgba(99,102,241,0.3))',
        }}
      />
    </motion.div>
  );
}

// ── Boot Sequence Component ──

function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'dark' | 'logo' | 'brain' | 'done'>('dark');

  useEffect(() => {
    // Extended cinematic boot — ~3s total for a more majestic reveal
    const t1 = setTimeout(() => {
      setPhase('logo');
      playBootUp();
      playLogoReveal();
    }, 600);  // dark → logo at 600ms

    const t2 = setTimeout(() => {
      setPhase('brain');
      playBrainActivate();
    }, 2000); // logo → brain at 2000ms (1.4s logo duration)

    const t3 = setTimeout(() => {
      setPhase('done');
      playWelcomeChime();
      onComplete();
    }, 3000); // brain → done at 3000ms (1s brain duration)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        inset: 0,
        background: phase === 'dark' ? '#000' : 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Particles during boot */}
      {phase !== 'dark' && <Particles count={20} />}

      {/* Neural Brain Scene - appears after logo */}
      {phase === 'brain' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ width: 200, height: 200, position: 'relative', zIndex: 1 }}
        >
          <NeuralBrainScene command={COMMANDS[0]} pulseImpulse={5} transparent={true} />
        </motion.div>
      )}

      {/* Logo - appears after dark phase */}
      {(phase === 'logo' || phase === 'brain') && (
        <LogoReveal visible={true} />
      )}

      {/* "Conflux Home" text fade-in */}
      {phase === 'brain' && (
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
          style={{
            fontSize: 28,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #00d4ff, #6366f1)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '-0.5px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          Conflux Home
        </motion.h1>
      )}
    </motion.div>
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

// ── Agent Card (for team intro — with voice play button) ──

function AgentIntroCard({
  player,
  visible,
  isPlaying,
  onToggleVoice,
}: {
  player: KeyPlayer;
  visible: boolean;
  isPlaying: boolean;
  onToggleVoice: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.85 }}
      animate={visible ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 24, scale: 0.85 }}
      transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        width: 110,
        cursor: 'pointer',
      }}
      onClick={() => onToggleVoice()}
    >
      {/* Avatar circle */}
      <motion.div
        animate={
          isPlaying
            ? {
                boxShadow: [
                  `0 0 12px ${player.color}44`,
                  `0 0 24px ${player.color}66`,
                  `0 0 12px ${player.color}44`,
                ],
                scale: [1, 1.08, 1],
              }
            : (player.id === 'hearth' || player.id === 'echo')
            ? {
                boxShadow: [
                  `0 0 4px ${player.color}33`,
                  `0 0 10px ${player.color}55`,
                  `0 0 4px ${player.color}33`,
                ],
              }
            : {}
        }
        transition={
          isPlaying
            ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
            : (player.id === 'hearth' || player.id === 'echo')
            ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
            : {}
        }
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: `${player.color}15`,
          border: `2px solid ${player.color}33`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          filter: `drop-shadow(0 0 10px ${player.color}33)`,
          transition: 'all 0.3s ease',
          position: 'relative',
        }}
      >
        {player.emoji}

        {/* Voice playing indicator */}
        {isPlaying && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              bottom: -6,
              right: -6,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: player.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: 'white',
            }}
          >
            ♪
          </motion.div>
        )}
      </motion.div>

      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: player.color }}>
        {player.name}
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', lineHeight: 1.3, textAlign: 'center', maxWidth: 100 }}>
        {player.tagline}
      </div>

      {/* ▶ Play Intro button */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => { e.stopPropagation(); onToggleVoice(); }}
        style={{
          background: 'transparent',
          border: `1px solid ${player.color}44`,
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: '0.6rem',
          color: player.color,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          opacity: 0.75,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = player.color; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.75'; e.currentTarget.style.borderColor = `${player.color}44`; }}
      >
        {isPlaying ? '⏹ Stop' : '▶ Intro'}
      </motion.button>
    </motion.div>
  );
}

// ── Main Component ──

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(-1); // -1 = boot sequence, 0+ = normal steps
  const [animating, setAnimating] = useState(false);
  const [bootDone, setBootDone] = useState(false);

  // Step 0: Name
  const [userName, setUserName] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [heartbeatActive, setHeartbeatActive] = useState(false);

  // Step 1-2: Agent intro
  const [visibleAgents, setVisibleAgents] = useState<Set<string>>(new Set());
  const [showProtectors, setShowProtectors] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [narrationStarted, setNarrationStarted] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const narrationTimerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Step 2: Ice breaker
  const [iceBreakerInput, setIceBreakerInput] = useState('');

  // Step 3: Building world
  const [buildProgress, setBuildProgress] = useState(0);
  const [buildPhase, setBuildPhase] = useState<'selecting' | 'building' | 'done'>('selecting');
  const [suggestedApps, setSuggestedApps] = useState<string[]>([]);

  // Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Pre-warm AudioContext on mount (saves ~200ms on first play)
  useEffect(() => {
    const warm = () => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    };
    warm();
  }, []);

  // ── Stop any currently playing audio ──
  const stopAudio = useCallback(() => {
    try {
      activeSourceRef.current?.stop();
    } catch (_) { /* ignore if already stopped */ }
    activeSourceRef.current = null;
    setPlayingVoiceId(null);
  }, []);

  // ── Boot sequence complete ──
  const handleBootComplete = useCallback(() => {
    setBootDone(true);
    setStep(0);
    stopAudio(); // clean up any in-progress audio
  }, [stopAudio]);

  // ── Play base64 MP3 audio via Web Audio API ──
  const playBase64Audio = useCallback((base64: string, opts?: { onstart?: () => void }): Promise<void> => {
    stopAudio(); // stop any existing playback
    return new Promise((resolve, reject) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      ctx.decodeAudioData(bytes.buffer).then((buffer) => {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        activeSourceRef.current = source;
        source.onended = () => {
          activeSourceRef.current = null;
          resolve();
        };
        source.start(0);
        opts?.onstart?.();
      }).catch(reject);
    });
  }, [stopAudio]);

  // ── TTS via ElevenLabs (Rust backend) ──
  const speakWithVoice = useCallback(async (text: string, agentId: string): Promise<void> => {
    const voiceId = AGENT_VOICE_IDS[agentId] || AGENT_VOICE_IDS.conflux;
    stopAudio(); // stop any currently playing audio first
    setPlayingVoiceId(agentId);
    playVoiceClick();

    try {
      const result = await invoke<{ audio_base64: string }>('tts_speak', {
        text,
        voice: voiceId, // Pass the ElevenLabs voice ID directly
      });
      await playBase64Audio(result.audio_base64);
    } catch (err) {
      console.warn(`[Onboarding] TTS failed for ${agentId} (non-fatal):`, err);
    } finally {
      setPlayingVoiceId(null);
    }
  }, [stopAudio, playBase64Audio]);

  // Voice toggle — stop if same agent, speak if different
  const handleVoiceToggle = useCallback((agentId: string, voiceLine: string) => {
    if (playingVoiceId === agentId) {
      stopAudio();
    } else {
      stopAudio();
      speakWithVoice(voiceLine, agentId);
    }
  }, [playingVoiceId, stopAudio, speakWithVoice]);

  // ── Conflux narration (uses Conflux voice) ──
  const speakNarration = useCallback(async () => {
    const text = getNarrationScript(userName);
    setIsSpeaking(true);
    setNarrationStarted(false); // ensure clean state
    try {
      const result = await invoke<{ audio_base64: string }>('tts_speak', {
        text,
        voice: AGENT_VOICE_IDS.conflux,
      });
      await playBase64Audio(result.audio_base64, {
        onstart: () => setNarrationStarted(true),
      });
    } catch (err) {
      console.warn('[Onboarding] TTS failed (non-fatal):', err);
      setNarrationStarted(true); // still start agents on error
    } finally {
      setIsSpeaking(false);
    }
  }, [userName, playBase64Audio]);

  // ── Ice breaker TTS ──
  const speakIceBreaker = useCallback(async () => {
    const text = `So — what brought you here? What's the first thing you need help with?`;
    try {
      const result = await invoke<{ audio_base64: string }>('tts_speak', {
        text,
        voice: AGENT_VOICE_IDS.conflux,
      });
      await playBase64Audio(result.audio_base64);
    } catch (err) {
      console.warn('[Onboarding] Ice breaker TTS failed (non-fatal):', err);
    }
  }, [playBase64Audio]);

  // ── Load persisted name ──
  useEffect(() => {
    const savedName = localStorage.getItem('conflux-name');
    if (savedName) setUserName(savedName);
  }, []);

  // ── Step 1: Start Conflux narration ──
  useEffect(() => {
    if (step !== 1) return;

    playNarrationSignal();
    speakNarration(); // triggers setNarrationStarted when audio begins

    return () => {
      // Cleanup: stop any pending agent timers when leaving step
      narrationTimerRef.current.forEach(clearTimeout);
      narrationTimerRef.current = [];
      setNarrationStarted(false);
    };
  }, [step, speakNarration]);

  // ── Step 1: Stagger agent card appearances (triggered when narration audio starts) ──
  useEffect(() => {
    if (step !== 1 || !narrationStarted) return;

    const allPlayers = [...KEY_PLAYERS, ...PROTECTORS];
    allPlayers.forEach(player => {
      const timer = setTimeout(() => {
        setVisibleAgents(prev => new Set([...prev, player.id]));
        playAgentAppear(player.id);
      }, player.delay);
      narrationTimerRef.current.push(timer);
    });

    // Show protectors label after main agents
    const protectorTimer = setTimeout(() => {
      setShowProtectors(true);
      playTeamAliveNew(); // celebratory chime when protectors arrive
    }, 15500);
    narrationTimerRef.current.push(protectorTimer);

    return () => {
      narrationTimerRef.current.forEach(clearTimeout);
      narrationTimerRef.current = [];
    };
  }, [step, narrationStarted]);

  // ── Audio cleanup ──
  // Stop any voice playback when leaving the team-intro step (or unmounting)
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  useEffect(() => {
    if (step !== 1) {
      stopAudio();
    }
  }, [step, stopAudio]);

  // ── Step 2: Speak ice breaker prompt ──
  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => speakIceBreaker(), 400);
      return () => clearTimeout(t);
    }
  }, [step, speakIceBreaker]);

  // ── Navigation ──
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

  // Finish onboarding
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
    playBuildComplete();
    await delay(600);

    // Save and complete
    localStorage.setItem('conflux-onboarded', 'true');
    localStorage.setItem('conflux-name', userName.trim() || 'there');
    localStorage.setItem('conflux-setup-apps', JSON.stringify(apps));

    try {
      await invoke('save_user_profile', {
        profile: {
          name: userName.trim() || 'there',
          onboarded: true,
          goals: iceBreakerInput.trim() ? [iceBreakerInput.trim()] : null,
          selected_apps: apps,
        },
      });
    } catch (e: any) {
      console.warn('[Onboarding] Failed to save profile to backend:', e);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert(`Profile save failed: ${e?.message || String(e)}`);
      }
    }

    // Persist ice breaker answer
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

  // Step -1: Boot Sequence
  if (step === -1 && !bootDone) {
    return <BootSequence onComplete={handleBootComplete} />;
  }

  // Step 0: "Who Are You?" — Name input + heartbeat + neural brain
  const renderNameStep = () => (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      style={{ textAlign: 'center', maxWidth: 420, width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}
    >
      <Particles count={15} />

      <div style={{ marginBottom: 24 }}>
        <LogoReveal visible={true} />
      </div>

      <h1 style={{
        fontSize: 32, fontWeight: 700, letterSpacing: '-0.5px',
        background: 'linear-gradient(135deg, #00d4ff, #6366f1)',
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        marginBottom: 12,
      }}>
        Welcome to Conflux Home
      </h1>

      <p style={{ fontSize: 17, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.5 }}>
        Your AI family is about to come alive.
      </p>

      <div style={{ marginBottom: 24, opacity: 0.8 }}>
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

  // Step 1: "Meet Your Team" — Cinematic intro with all agents
  const renderTeamIntroStep = () => (
    <motion.div
      key="step-team-intro"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30 }}
      transition={{ duration: 0.5 }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        maxWidth: 900, width: '100%', textAlign: 'center', position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Neural brain pulsing during narration */}
      <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', zIndex: 0 }}>
        <NeuralBrainScene
          command={narrationStarted ? COMMANDS[3] : COMMANDS[1]}
          pulseImpulse={narrationStarted ? 20 : 8}
          transparent={true}
        />
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{
          fontSize: '2rem', fontWeight: 700,
          background: 'linear-gradient(135deg, #00d4ff, #6366f1, #a78bfa)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 8, marginTop: 40,
        }}
      >
        Meet Your Team
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: 32, maxWidth: 500 }}
      >
        {userName ? `${userName},` : ''} each one has a specialty. Together, they're unstoppable.
      </motion.p>

      {/* All Agents Grid (KEY_PLAYERS + PROTECTORS) */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 20, flexWrap: 'wrap',
      }}>
        {KEY_PLAYERS.map(player => (
          <AgentIntroCard
            key={player.id}
            player={player}
            visible={visibleAgents.has(player.id)}
            isPlaying={playingVoiceId === player.id}
            onToggleVoice={() => handleVoiceToggle(player.id, player.voiceLine)}
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
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 8 }}
          >
          {/* Play team alive chime when protectors make their entrance */}
          <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              color: 'var(--text-tertiary)', fontSize: '0.8rem',
              textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 600,
            }}>
              <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
              And these two? They protect everything.
              <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              {PROTECTORS.map(player => (
                <AgentIntroCard
                  key={player.id}
                  player={player}
                  visible={visibleAgents.has(player.id)}
                  isPlaying={playingVoiceId === player.id}
                  onToggleVoice={() => handleVoiceToggle(player.id, player.voiceLine)}
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
        style={{ marginTop: 36 }}
      >
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96, opacity: 0.8 }}
          transition={{ duration: 0.15 }}
          onClick={nextStep}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: 'linear-gradient(135deg, #00d4ff, #6366f1)',
            color: 'white', border: 'none', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {isSpeaking ? '🎙️ Conflux is speaking...' : 'What do you need? →'}
        </motion.button>
      </motion.div>
    </motion.div>
  );

  // Step 2: "What Do You Need?" — Ice Breaker
  const renderIceBreakerStep = () => (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
      style={{ textAlign: 'center', maxWidth: 520, width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}
    >
      {/* Conflux brain in background */}
      <div style={{ position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)' }}>
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
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96, opacity: 0.8 }}
          transition={{ duration: 0.15 }}
          onClick={handleFinish}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: iceBreakerInput.trim() ? 'linear-gradient(135deg, #00d4ff, #6366f1)' : 'var(--bg-card)',
            color: iceBreakerInput.trim() ? 'white' : 'var(--text-secondary)',
            border: iceBreakerInput.trim() ? 'none' : '1px solid var(--border)',
            fontSize: 16, fontWeight: 600, cursor: 'pointer',
            opacity: iceBreakerInput.trim() ? 1 : 0.6,
            transition: 'all 0.2s ease',
          }}
        >
          Let's Build →
        </motion.button>
      </div>
    </motion.div>
  );

  // Step 3: "Building Your World"
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
          maxWidth: 480, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1,
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
                    background: 'linear-gradient(90deg, #00d4ff, #6366f1)',
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
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Global particles background */}
      <Particles count={12} color="#6366f1" />

      {/* Progress Bar — only show during name + team intro + ice breaker */}
      {step >= 0 && step < 3 && <ProgressBar step={step} />}

      {/* Content Area */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '24px', overflow: 'auto',
        position: 'relative', zIndex: 1,
      }}>
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation — only for steps 0 and 1 */}
      {step >= 0 && step < 2 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 24px 28px', flexShrink: 0, position: 'relative', zIndex: 1,
        }}>
          <div>
            {step > 0 && (
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.15 }}
                onClick={prevStep} style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px 20px', color: 'var(--text-secondary)', fontSize: 14,
                  fontWeight: 500, cursor: 'pointer',
                }}
              >
                ← Back
              </motion.button>
            )}
          </div>

          {step === 0 && (
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96, opacity: 0.8 }}
              transition={{ duration: 0.15 }}
              onClick={nextStep}
              disabled={userName.trim().length === 0}
              style={{
                width: 'auto', padding: '10px 28px',
                opacity: userName.trim().length === 0 ? 0.5 : 1,
                cursor: userName.trim().length === 0 ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #00d4ff, #6366f1)',
                color: 'white', border: 'none', borderRadius: 10,
                fontSize: 15, fontWeight: 600,
              }}
            >
              Get Started
            </motion.button>
          )}
        </div>
      )}
    </div>
  );
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
