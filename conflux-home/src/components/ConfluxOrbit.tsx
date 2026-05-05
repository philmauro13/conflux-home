import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { useGlobalClickSound } from '../hooks/useGlobalClickSound';
import { ConfluxPresence, useConfluxController, attachTauriConfluxListeners } from './conflux';
import MorningBriefOverlay, { useMorningBrief } from './MorningBriefOverlay';
import type { FairyExpression, FairyNudge } from './conflux';
import type { ConfluxTauriListen } from './conflux';
import { View } from '../types';
import { useEffect, useRef, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

interface WizardSequenceStep {
  x: number;
  y: number;
  delay: number;
  label?: string;
}

interface ConfluxOrbitProps {
  view: View;
  immersiveView: View | null;
  chatOpen: boolean;
  voiceChatOpen: boolean;
  isPushToTalkActive: boolean;
  wizardMode?: boolean;
  wizardSequence?: WizardSequenceStep[];
}

// Magnetic Zones: target coordinates for each app view
// Conflux "zips" to the right spot instead of floating randomly
const ELEMENT_H = 300;

const MAGNETIC_ZONES: Record<string, { x: number; y: number; scale?: number }> = {
  budget:    { x: 0,      y: 0.5,  scale: 0.7 }, // Left-center
  kitchen:   { x: 0.95,   y: 0.28, scale: 0.7 }, // Upper-right
  life:      { x: 0.95,   y: 0.5,  scale: 0.7 }, // Right-center
  dreams:    { x: 0.5,    y: 0.18, scale: 0.8 }, // Top-center
  games:     { x: 0.05,   y: 0.5,  scale: 0.7 }, // Left-center
  feed:      { x: 0.5,    y: 0.5,  scale: 0.7 }, // Center
  marketplace:{ x: 0.5,    y: 0.5,  scale: 0.7 }, // Center
  echo:      { x: 0.05,   y: 0.5,  scale: 0.7 }, // Left-center
  vault:     { x: 0.05,   y: 0.5,  scale: 0.7 }, // Left-center
  studio:    { x: 0.05,   y: 0.5,  scale: 0.7 }, // Left-center
  settings:  { x: 0.95,   y: 0.5,  scale: 0.7 }, // Right-center
  dashboard: { x: 0.5,    y: 0.76, scale: 0.85 }, // Bottom-center (near dock)
  agents:    { x: 0.05,   y: 0.5,  scale: 0.7 }, // Left-center
  'api-dashboard': { x: 0.05, y: 0.5, scale: 0.7 },
};

// App-to-lobe mapping for routePulse
// Each app triggers specific Conflux lobes (from valid LobeName type)
const APP_LOBE_MAP: Record<string, string> = {
  budget: 'reasoning',
  kitchen: 'memory',
  life: 'tools',
  home: 'perception',
  dreams: 'speech',
  games: 'memory',
  feed: 'perception',
  marketplace: 'tools',
  echo: 'memory',
  vault: 'perception',
  studio: 'tools',
  settings: 'tools',
  agents: 'tools',
  'api-dashboard': 'perception',
};

const EMPTY_SEQ: never[] = [];

export default function ConfluxOrbit({ view, immersiveView, chatOpen, voiceChatOpen, isPushToTalkActive, wizardMode = false, wizardSequence = EMPTY_SEQ }: ConfluxOrbitProps) {
  // Global click sound — fired from ConfluxOrbit (always mounted desktop shell)
  useGlobalClickSound();

  // ── Conflux Fairy State ───────────────────────────────────────────────────
  const [fairyExpression, setFairyExpression] = useState<FairyExpression>('idle');
  const [fairyNudge, setFairyNudge] = useState<FairyNudge | null>(null);

  // Subscribe to fairy nudge events from the heartbeat system
  useEffect(() => {
    const handler = (e: Event) => setFairyNudge((e as CustomEvent<FairyNudge>).detail);
    window.addEventListener('conflux:fairy-nudge', handler);
    return () => window.removeEventListener('conflux:fairy-nudge', handler);
  }, []);

  // Update fairy expression based on open app / activity
  useEffect(() => {
    if (voiceChatOpen) { setFairyExpression('listening'); return; }
    if (chatOpen) { setFairyExpression('thinking'); return; }
    setFairyExpression('idle');
  }, [voiceChatOpen, chatOpen]);

  // Wizard Mode: cycle through sequence steps
  const [wizardStepIndex, setWizardStepIndex] = useState(0);

  useEffect(() => {
    if (!wizardMode || wizardSequence.length === 0) {
      setWizardStepIndex(0);
      return;
    }

    const currentStep = wizardSequence[wizardStepIndex % wizardSequence.length];
    const timer = setTimeout(() => {
      setWizardStepIndex(prev => (prev + 1) % wizardSequence.length);
    }, currentStep.delay);

    return () => clearTimeout(timer);
  }, [wizardMode, wizardSequence]); // Removed wizardStepIndex to prevent infinite loop

  // Audio Context for TTS playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const playTTS = useCallback((base64: string, sampleRate: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioContextRef.current;
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode MP3 (browser native) - note: browser decodeAudioData expects compressed audio (mp3/wav/etc)
    ctx.decodeAudioData(bytes.buffer).then((audioBuffer) => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
      
      // Trigger the fairy to speak visually when audio starts
      conflux.setMode('speak', 'backend', 'Speaking...');
      console.log('[ConfluxOrbit] Playing TTS audio');

      // Reset to idle when audio finishes
      source.onended = () => {
        console.log('[ConfluxOrbit] TTS finished, returning to idle');
        conflux.setMode('idle', 'backend', 'Ready');
      };
    }).catch(e => console.error('TTS Decode Error:', e));
  }, []);
  const conflux = useConfluxController({
    initialMode: 'idle',
    initialTransparent: true,
    initialStatus: 'System Online',
  });

  // Wire up Tauri event listeners for conflux:state and conflux:pulse
  // useEventListener ref pattern: useEffectEvent returns a new wrapper each render,
  // so we store it in a ref to keep the dependency array stable.
  const applyEventRef = useRef(conflux.applyEvent);
  applyEventRef.current = conflux.applyEvent;



  useEffect(() => {
    let disposed = false;
    let cleanup: { dispose: () => Promise<void> } | undefined;

    const tauriListen: ConfluxTauriListen = (event, handler) => {
      return listen(event, (e) => handler(e as any));
    };

    attachTauriConfluxListeners(
      tauriListen, 
      (event, source) => {
        // Log raw payload to diagnose STT pipeline
        console.log('[ConfluxOrbit] conflux:state event received:', JSON.stringify(event));
        console.log('[ConfluxOrbit] Event source:', source);
        
        // Handle new conflux:state event format
        const stateEvent = event as any;
        if (stateEvent.state) {
          console.log('[ConfluxOrbit] State transition:', stateEvent.state, 'Source:', stateEvent.source || 'unknown');
          switch (stateEvent.state) {
            case 'Listening':
              conflux.setMode('listen', 'backend', 'Listening...');
              break;
            case 'Thinking':
              conflux.setMode('focus', 'backend', 'Thinking...');
              // Start continuous very vibrant pulse every 500ms while thinking
              const pulseIntervalId = setInterval(() => {
                if (conflux.mode === 'focus') {
                  conflux.triggerPulse(15, 'Thinking...'); // Strong recurring pulse
                } else {
                  clearInterval(pulseIntervalId);
                }
              }, 500); // Fast pulses
              break;
            case 'Speaking':
              conflux.setMode('speak', 'backend', 'Speaking...');
              break;
            case 'Idle':
              conflux.setMode('idle', 'backend', 'Ready');
              break;
            case 'Error':
              conflux.setMode('idle', 'backend', stateEvent.message || 'Error');
              break;
          }
        }
        
        if (event.listeningCadence) {
          console.log('[ConfluxOrbit] listeningCadence tokens:', event.listeningCadence.tokens);
        }
        applyEventRef.current(event, source);
      },
      // Handle TTS audio playback via Web Audio API
      (audioData) => {
        console.log('[ConfluxOrbit] TTS audio received');
        playTTS(audioData.audio_base64, audioData.sample_rate);
      }
    ).then((bridge) => {
      if (disposed) {
        void bridge.dispose();
        return;
      }
      cleanup = bridge;
      console.log('[ConfluxOrbit] Tauri listeners attached');
    });

    return () => {
      disposed = true;
      void cleanup?.dispose();
    };
  }, []);

  // Listen for Push-to-Talk events
  useEffect(() => {
    const handlePTTStart = () => {
      console.log('[ConfluxOrbit] PTT Start - switching to listen mode');
      conflux.setMode('listen', 'manual', 'Listening...');
      // Trigger a pulsing ripple effect to indicate the fairy is ready
      conflux.triggerPulse(5, 'PTT Engaged');
    };
    const handlePTTEnd = () => {
      // Don't go idle yet — stay in listen mode while transcription is processing.
      // The 'conflux-transcription-done' event will handle the final reset.
      console.log('[ConfluxOrbit] PTT End - keeping listen mode during transcription');
    };
    const handleTranscriptionDone = () => {
      console.log('[ConfluxOrbit] Transcription done - staying in listen mode, waiting for thinking state');
      conflux.triggerPulse(10, 'Transcription complete');
      // Don't reset to idle - the 'conflux:state' Thinking event will handle the transition
      // If Thinking state doesn't arrive, stay in listen until TTS starts
    };

    window.addEventListener('push-to-talk-start', handlePTTStart);
    window.addEventListener('push-to-talk-end', handlePTTEnd);
    window.addEventListener('conflux-transcription-done', handleTranscriptionDone);
    window.addEventListener('conflux-thinking', (e: any) => {
      console.log('[ConfluxOrbit] Thinking...', e.detail?.text);
      conflux.setMode('focus', 'backend', 'Thinking...');
    });

    return () => {
      window.removeEventListener('push-to-talk-start', handlePTTStart);
      window.removeEventListener('push-to-talk-end', handlePTTEnd);
      window.removeEventListener('conflux-transcription-done', handleTranscriptionDone);
      window.removeEventListener('conflux-thinking', () => {});
    };
  }, []);

  // Determine position based on app state
  // Using window.innerWidth/Height to handle responsiveness
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Set initial dimensions immediately
    setDimensions({ width: window.innerWidth, height: window.innerHeight });
    
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Builder Mode state: detect user typing/interaction
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const builderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Builder Mode: currently disabled (removed keydown/click listeners)

  // App Awareness: monitor immersiveView and trigger routePulse with specific lobes
  useEffect(() => {
    if (!immersiveView) {
      // Return to idle when leaving an app - reset to default
      console.log('[ConfluxOrbit] Leaving app, resetting to default palette');
      conflux.setMode('idle', 'manual', 'Ready');
      return;
    }

    const lobe = APP_LOBE_MAP[immersiveView];
    if (lobe) {
      console.log(`[ConfluxOrbit] App changed to ${immersiveView}, triggering lobe: ${lobe}`);
      // Pass lobe as the 'lobe' property for single-lobe targeting
      conflux.routePulse({ lobe: lobe as any }, `Navigating to ${immersiveView}`);
    }
    
    // Set app-specific palette
    // Map view name to valid palette name
    const paletteMap: Record<string, string> = {
      budget: 'budget',
      kitchen: 'kitchen',
      life: 'life',
      dreams: 'dreams',
      agents: 'agents',
      feed: 'feed',
      games: 'games',
      marketplace: 'marketplace',
      settings: 'settings',
      studio: 'studio',
      vault: 'vault',
      echo: 'echo',
      home: 'home',
      dashboard: 'dashboard',
      google: 'google',
      'api-dashboard': 'api-dashboard'
    };
    
    const paletteName = paletteMap[immersiveView] || 'dashboard';
    console.log(`[ConfluxOrbit] Setting app palette for: ${immersiveView} -> ${paletteName}`);
    conflux.setAppPaletteMode(paletteName as any);
    
    // Log the effective palette for debugging
    console.log(`[ConfluxOrbit] Effective palette:`, conflux.effectivePalette);
  }, [immersiveView]);

  // Logic for "Fairy" positioning with Magnetic Zones
  let targetX = dimensions.width - 350;
  let targetY = dimensions.height - 350;
  let scale = 1;

  const isSpeaking = conflux.mode === 'speak';
  const isThinking = conflux.mode === 'focus';

  if (wizardMode && wizardSequence.length > 0) {
    // Wizard Mode: override position with sequence coordinates
    const currentStep = wizardSequence[wizardStepIndex % wizardSequence.length];
    targetX = (dimensions.width - 300) * currentStep.x;
    targetY = (dimensions.height - 300) * currentStep.y;
    scale = 1;
  } else if (isPushToTalkActive || isSpeaking) {
    // When listening (PTT) or Speaking, fly to the center and grow
    targetX = dimensions.width / 2 - 250;
    targetY = dimensions.height / 2 - 250;
    scale = 1.8;
  } else if (isThinking) {
    // When thinking, fly to center and use larger scale for visibility
    targetX = dimensions.width / 2 - 250;
    targetY = dimensions.height / 2 - 250;
    scale = 1.6;
  } else if (chatOpen) {
    // Retreat behavior: move to bottom-left corner when chat is open
    targetX = (dimensions.width - 300) * 0.05;
    targetY = (dimensions.height - 300) * 0.9;
    scale = 0.6;
  } else if (immersiveView) {
    // Magnetic Zones: use pre-defined coordinates for each app view
    const zone = MAGNETIC_ZONES[immersiveView];
    if (zone) {
      const elH = ELEMENT_H * (zone.scale ?? 0.7);
      const avH = dimensions.height - 56; // available height below TopBar and above ConfluxBar
      targetX = (dimensions.width - elH) * zone.x;
      targetY = (avH - elH) * zone.y; // top of element within available space
      scale = zone.scale ?? 0.7;
    } else {
      // Fallback for unknown views
      targetX = dimensions.width - 350;
      targetY = 50;
      scale = 0.75;
    }
  } else if (view === 'dashboard') {
    // Idle state: hovering near the dock (ConfluxBarV2) — full scale
    targetX = dimensions.width - 320;
    targetY = dimensions.height - 56 - ELEMENT_H - 16; // 16px above ConfluxBar
    scale = 1;
  }

  // Builder Mode overrides: Gold pulse, slightly larger, higher z-index
  if (isBuilderMode) {
    scale = Math.max(scale, 0.85);
  }

  // Fly-Over Animation: curved bezier flight path using spring physics
  // For wizard mode, the spring handles the final position settle;
  // the organic curve/oscillation is applied via the wizardOffset wrapper.
  const getTransitionConfig = () => {
    if (wizardMode) {
      // Snappy spring for the base position — the organic wiggle is layered on top
      return {
        type: 'spring' as const,
        stiffness: 200,
        damping: 22,
        mass: 0.3,
        bounce: 0.1,
      };
    }
    return {
      type: 'spring' as const,
      stiffness: isBuilderMode ? 120 : 80,
      damping: isBuilderMode ? 20 : 18,
      mass: isBuilderMode ? 0.4 : 0.6,
      bounce: 0.3,
      duration: 0.8,
    };
  };

  // Add bezier offset for curved flight path (non-wizard mode only)
  const [bezierOffset, setBezierOffset] = useState({ x: 0, y: 0 });
  const prevImmersiveViewRef = useRef(immersiveView);

  // Drag-and-move: save/restore position from localStorage
  const [dragOverride, setDragOverride] = useState<{ x: number; y: number } | null>(() => {
    const saved = localStorage.getItem('conflux-fairy-pos');
    if (saved) {
      try {
        const { rx, ry } = JSON.parse(saved);
        return { x: rx * window.innerWidth, y: ry * window.innerHeight };
      } catch { return null; }
    }
    return null;
  });
  // One-shot flag: fires a spring to magnetic zone when setDragOverride(null) is called
  const [transitioningToZone, setTransitioningToZone] = useState(false);
  const transitioningRef = useRef(false);

  useEffect(() => {
    if (wizardMode) return; // Skip non-wizard bezier — wizard has its own
    if (immersiveView !== prevImmersiveViewRef.current && immersiveView) {
      // Trigger a brief "fly-over" curve when entering a new app
      const curveDirection = Math.random() > 0.5 ? 1 : -1;
      setBezierOffset({ x: 100 * curveDirection, y: -80 });
      
      const timer = setTimeout(() => {
        setBezierOffset({ x: 0, y: 0 });
      }, 600);
      
      return () => clearTimeout(timer);
    }
    prevImmersiveViewRef.current = immersiveView;
  }, [immersiveView, wizardMode]);

  // On view change: clear dragOverride → triggers one-shot spring to magnetic zone
  useEffect(() => {
    if (dragOverride !== null) {
      transitioningRef.current = true;
      setTransitioningToZone(true);
      setDragOverride(null);
    }
  }, [view, immersiveView]);

  // onDragStart: clear all accumulated offsets immediately on grab
  const handleDragStart = useCallback(() => {
    transitioningRef.current = false;
    setTransitioningToZone(false);
    setWizardOffset({ x: 0, y: 0 });
    setBezierOffset({ x: 0, y: 0 });
  }, []);

  // Drag handler: info.point.x/y is the exact final viewport position after drag.
  // Write it to state — NO spring, no animate. User drops it exactly where they release.
  const handleDragEnd = useCallback((_e: any, info: { point: { x: number; y: number } }) => {
    transitioningRef.current = false;
    setTransitioningToZone(false);
    const finalX = info.point.x;
    const finalY = info.point.y;
    setDragOverride({ x: finalX, y: finalY });
    setWizardOffset({ x: 0, y: 0 });
    setBezierOffset({ x: 0, y: 0 });
    localStorage.setItem('conflux-fairy-pos', JSON.stringify({
      rx: finalX / window.innerWidth,
      ry: finalY / window.innerHeight,
    }));
  }, []);

  // ─── Wizard Mode: Organic Bezier Movement ─────────────────────────
  // Layered on top of the base spring position so non-wizard transitions stay intact.
  // Phases: dashing (bezier curve + oscillation) → hovering (settle) → thinking (micro-drift)
  const [wizardOffset, setWizardOffset] = useState({ x: 0, y: 0 });
  // Ref mirror of wizardOffset to avoid reading stale state inside the rAF loop
  const wizardOffsetRef = useRef({ x: 0, y: 0 });
  const wizardAnimRef = useRef<{
    rafId: number;
    phase: 'dashing' | 'hovering' | 'thinking';
    phaseStart: number;
    ctrlX: number;
    ctrlY: number;
    oscFreq: number;
    oscAmp: number;
    srcX: number;
    srcY: number;
    dashDuration: number;
    hoverDuration: number;
    thinkDuration: number;
    lastStepKey: string;
  }>({
    rafId: 0,
    phase: 'dashing',
    phaseStart: 0,
    ctrlX: 0,
    ctrlY: 0,
    oscFreq: 3 + Math.random() * 3,
    oscAmp: 12 + Math.random() * 15,
    srcX: 0,
    srcY: 0,
    dashDuration: 400 + Math.random() * 200,   // 400-600ms fast dash
    hoverDuration: 300 + Math.random() * 200,   // 300-500ms brief pause
    thinkDuration: 500 + Math.random() * 400,   // 500-900ms micro-drift
    lastStepKey: '',
  });

  // Sync ref with state to avoid stale reads in RAF loop
  useEffect(() => {
    wizardOffsetRef.current = wizardOffset;
  }, [wizardOffset]);

  useEffect(() => {
    if (!wizardMode || wizardSequence.length === 0) {
      setWizardOffset({ x: 0, y: 0 });
      const a = wizardAnimRef.current;
      if (a.rafId) cancelAnimationFrame(a.rafId);
      return;
    }

    const currentStep = wizardSequence[wizardStepIndex % wizardSequence.length];
    const stepKey = `${currentStep.x},${currentStep.y},${wizardStepIndex}`;

    const state = wizardAnimRef.current;
    const now = performance.now();
    const prevRafId = state.rafId; // Store previous ID before starting new loop

    // Each step restarts the dashing phase with fresh random params
    if (stepKey !== state.lastStepKey) {
      state.lastStepKey = stepKey;

      // Source = current apparent offset (smooth handoff)
      state.srcX = wizardOffsetRef.current.x;
      state.srcY = wizardOffsetRef.current.y;

      // Quadratic bezier control point with random offset from midpoint
      state.ctrlX = state.srcX / 2 + (Math.random() - 0.5) * 200;
      state.ctrlY = state.srcY / 2 + (Math.random() - 0.5) * 100;

      // Randomise oscillation and pacing per step
      state.oscFreq = 3 + Math.random() * 3;
      state.oscAmp = 12 + Math.random() * 15;
      state.dashDuration = 400 + Math.random() * 200;
      state.hoverDuration = 300 + Math.random() * 200;
      state.thinkDuration = 500 + Math.random() * 400;

      state.phase = 'dashing';
      state.phaseStart = now;
    }

    // Cancel any previous loop before starting a new one
    if (prevRafId) cancelAnimationFrame(prevRafId);

    // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
    // P0=src, P1=ctrl, P2=(0,0) — always curves back to the spring-settled position
    function quadBezier(p0: number, p1: number, p2: number, t: number): number {
      const mt = 1 - t;
      return mt * mt * p0 + 2 * mt * t * p1 + t * t * p2;
    }

    function loop() {
      const s = wizardAnimRef.current;
      const t = performance.now();
      const elapsed = t - s.phaseStart;

      if (s.phase === 'dashing') {
        const rawT = Math.min(elapsed / s.dashDuration, 1);
        // Ease-out cubic for snappy dash feel
        const easedT = 1 - Math.pow(1 - rawT, 3);

        const bx = quadBezier(s.srcX, s.ctrlX, 0, easedT);
        const by = quadBezier(s.srcY, s.ctrlY, 0, easedT);

        // Sine-wave zig-zag perpendicular to travel (fades out near destination)
        const zigFade = 1 - rawT * rawT; // fade quickly
        const zigzagX = Math.sin(easedT * s.oscFreq * Math.PI * 2) * s.oscAmp * zigFade;
        const zigzagY = Math.cos(easedT * s.oscFreq * Math.PI * 2) * s.oscAmp * 0.5 * zigFade;

        setWizardOffset({ x: bx + zigzagX, y: by + zigzagY });

        if (rawT >= 1) {
          s.phase = 'hovering';
          s.phaseStart = t;
        }
      } else if (s.phase === 'hovering') {
        // Small jitter — like a butterfly hovering
        const jitterX = (Math.random() - 0.5) * 3;
        const jitterY = (Math.random() - 0.5) * 3;
        setWizardOffset({ x: jitterX, y: jitterY });

        if (elapsed >= s.hoverDuration) {
          s.phase = 'thinking';
          s.phaseStart = t;
        }
      } else if (s.phase === 'thinking') {
        // Organic micro-drift with layered sine waves (two frequencies = loopy Lissajous)
        const driftAmp = 6;
        const dx = Math.sin(t * 0.004) * driftAmp + Math.sin(t * 0.009) * driftAmp * 0.5;
        const dy = Math.cos(t * 0.005) * driftAmp * 0.8 + Math.cos(t * 0.011) * driftAmp * 0.3;
        setWizardOffset({ x: dx, y: dy });

        if (elapsed >= s.thinkDuration) {
          // Loop back to dashing with fresh random params
          s.srcX = dx;
          s.srcY = dy;
          s.ctrlX = dx / 2 + (Math.random() - 0.5) * 200;
          s.ctrlY = dy / 2 + (Math.random() - 0.5) * 100;
          s.oscFreq = 3 + Math.random() * 3;
          s.oscAmp = 12 + Math.random() * 15;
          s.dashDuration = 400 + Math.random() * 200;
          s.hoverDuration = 300 + Math.random() * 200;
          s.thinkDuration = 500 + Math.random() * 400;
          s.phase = 'dashing';
          s.phaseStart = t;
        }
      }

      s.rafId = requestAnimationFrame(loop);
    }

    state.rafId = requestAnimationFrame(loop);
    const currentRafId = state.rafId;
    return () => cancelAnimationFrame(currentRafId);
  }, [wizardMode, wizardSequence, wizardStepIndex]);

  if (dimensions.width === 0) return null;

  // Builder Mode: apply gold visual indicator via filter
  // Builder Mode: currently disabled - always return none
  const builderModeFilter = 'none';

  return (
    <>
      {/* NeuralBrain position — Framer Motion owns x/y during drag.
          After drag: handleDragEnd writes exact release coords to dragOverride.
          Magnetic zone: setTransitioningToZone(true) + clear dragOverride → one-shot spring. */}
      <motion.div
        initial={false}
        drag
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        // x/y: ONLY when transitioningToZone=true (one-shot spring to magnetic zone).
        // When isDragging or user has set a position: x/y are controlled by Framer Motion drag internally.
        animate={{
          x: transitioningToZone
            ? targetX + (wizardMode ? 0 : bezierOffset.x)
            : undefined,
          y: transitioningToZone
            ? targetY + (wizardMode ? 0 : bezierOffset.y)
            : undefined,
          scale,
          filter: builderModeFilter,
        }}
        transition={
          transitioningToZone
            ? { type: 'spring', stiffness: 100, damping: 18 }
            : { duration: 0 }
        }
        style={{
          position: 'fixed',
          zIndex: isBuilderMode ? 110 : 100,
          pointerEvents: 'auto',
          top: 0,
          left: 0,
          cursor: 'grab',
        }}
        whileDrag={{ cursor: 'grabbing' }}
      >
        {/* Wizard organic offset — applies bezier drift + oscillation. Always {0,0} outside wizard mode. */}
        <motion.div
          animate={{ x: wizardMode ? wizardOffset.x : 0, y: wizardMode ? wizardOffset.y : 0 }}
          transition={{ duration: 0 }}
          style={{ position: 'relative', top: 0, left: 0 }}
        >
          <ConfluxPresence
            command={conflux.command}
            pulseImpulse={conflux.pulseImpulse}
            pulseEvent={conflux.pulseEvent}
            transparent={conflux.transparent}
            effectivePalette={conflux.effectivePalette}
            fairyExpression={fairyExpression}
            fairyNudge={fairyNudge}
            onFairyNudgeClick={() => setFairyNudge(null)}
            style={{ width: 300, height: 300 }}
          />
        </motion.div>
      </motion.div>

      {/* Wizard Mode Label */}
      <AnimatePresence>
        {wizardMode && wizardSequence.length > 0 && (() => {
          const currentStep = wizardSequence[wizardStepIndex % wizardSequence.length];
          if (!currentStep.label) return null;
          return (
            <motion.div
              key={wizardStepIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              style={{
                position: 'fixed',
                left: targetX + 150 + (wizardMode ? wizardOffset.x : 0),
                top: targetY + 320 + (wizardMode ? wizardOffset.y : 0),
                zIndex: 101,
                pointerEvents: 'none',
                color: 'var(--accent-primary)',
                fontSize: 16,
                fontWeight: 600,
                textAlign: 'center',
                textShadow: '0 0 12px var(--accent-primary)',
                whiteSpace: 'nowrap',
              }}
            >
              {currentStep.label}
            </motion.div>
          );
        })()}
      </AnimatePresence>

    </>
  );
}
