import { useState, useEffect, useRef } from 'react';
import { NeuralBrainScene } from '../NeuralBrainScene';
import { BrainCommand, BrainMode } from './types';
import { COMMANDS, DEFAULT_COMMAND, APP_PALETTES } from '../../lib/neuralBrain';
import { PulseEventDetail } from './types';
import { CSSProperties, HTMLAttributes, useMemo } from 'react';
import { playFairyChime } from '../../lib/sound';
import './ConfluxPresence.css';

// ── Fairy expression type ──────────────────────────────────────────────────────
export type FairyExpression = 'idle' | 'listening' | 'thinking' | 'working' | 'alert' | 'night';

export interface FairyNudge {
  id: string;
  text: string;
  app?: string;
  priority?: 'info' | 'warn' | 'urgent';
}

// ── Expression → BrainMode mapping ────────────────────────────────────────────
const fairyExprToBrainMode: Record<FairyExpression, BrainMode> = {
  idle: 'idle',
  listening: 'listen',
  thinking: 'listen',
  working: 'speak',
  alert: 'speak',
  night: 'idle',
};

// ── Props ─────────────────────────────────────────────────────────────────────
type ConfluxPresenceProps = {
  mode?: BrainMode;
  command?: BrainCommand;
  pulseImpulse: number;
  pulseEvent?: PulseEventDetail & { id: number };
  transparent?: boolean;
  className?: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  appPalette?: string;
  effectivePalette?: {
    node: string;
    hot: string;
    line: string;
    glow: string;
    aura: string;
  };
  // ── Fairy (nudge) props ────────────────────────────────────────────────────
  fairyExpression?: FairyExpression;
  fairyNudge?: FairyNudge | null;
  onFairyNudgeClick?: (nudge: FairyNudge) => void;
};

const modeToCommand = (mode: BrainMode) =>
  COMMANDS.find((entry) => entry.mode === mode) ?? DEFAULT_COMMAND;

export function ConfluxPresence({
  mode,
  command,
  pulseImpulse,
  pulseEvent,
  transparent = true,
  className,
  style,
  containerProps,
  appPalette,
  effectivePalette,
  fairyExpression = 'idle',
  fairyNudge,
  onFairyNudgeClick,
}: ConfluxPresenceProps) {
  // Derive brain mode from fairy expression
  const brainMode: BrainMode = fairyExprToBrainMode[fairyExpression] ?? 'idle';
  const resolvedCommand = command ?? (mode ?? brainMode ? modeToCommand(mode ?? brainMode) : DEFAULT_COMMAND);

  // Merge effective palette into command if provided
  const mergedCommand = useMemo(() => {
    if (effectivePalette) return { ...resolvedCommand, palette: effectivePalette };
    const appPaletteEntry = appPalette ? APP_PALETTES[appPalette] : undefined;
    if (appPaletteEntry) return { ...resolvedCommand, palette: appPaletteEntry };
    return resolvedCommand;
  }, [resolvedCommand, effectivePalette, appPalette]);

  // Night mode dims the palette
  const isNight = fairyExpression === 'night';
  const nightCommand = useMemo(() => {
    if (!isNight) return mergedCommand;
    return {
      ...mergedCommand,
      palette: {
        node: '#2a2a5a',
        hot: '#4a4a8a',
        line: '#3a3a7a',
        glow: '#5a5aaa',
        aura: '#1a1a3a',
      },
      glowBoost: (mergedCommand.glowBoost ?? 1) * 0.4,
      pulseRate: (mergedCommand.pulseRate ?? 1) * 0.5,
    };
  }, [mergedCommand, isNight]);

  // Auto-dismiss nudge after 6s
  const [showBubble, setShowBubble] = useState(false);
  const prevNudgeRef = useRef<FairyNudge | null>(null);

  useEffect(() => {
    if (fairyNudge && fairyNudge !== prevNudgeRef.current) {
      prevNudgeRef.current = fairyNudge;
      setShowBubble(true);
      playFairyChime();
      const t = setTimeout(() => setShowBubble(false), 6000);
      return () => clearTimeout(t);
    }
  }, [fairyNudge]);

  const containerStyle: CSSProperties = {
    position: 'relative',
    ...(style ?? containerProps?.style),
  };

  return (
    <div
      {...containerProps}
      className={className ?? containerProps?.className}
      style={containerStyle}
    >
      <NeuralBrainScene
        command={nightCommand}
        pulseImpulse={pulseImpulse}
        pulseEvent={pulseEvent}
        transparent={transparent}
      />

      {/* Fairy nudge speech bubble */}
      {fairyNudge && showBubble && (
        <div
          className={`fairy-bubble fairy-bubble-${fairyNudge.priority ?? 'info'}`}
          onClick={() => {
            setShowBubble(false);
            onFairyNudgeClick?.(fairyNudge);
          }}
        >
          <div className="fairy-bubble-text">{fairyNudge.text}</div>
          {fairyNudge.app && (
            <div className="fairy-bubble-hint">Click to open →</div>
          )}
        </div>
      )}
    </div>
  );
}
