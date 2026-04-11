import { NeuralBrainScene } from "../NeuralBrainScene";
import { BrainCommand, BrainMode } from "./types";
import { COMMANDS, DEFAULT_COMMAND, APP_PALETTES } from "../../lib/neuralBrain";
import { PulseEventDetail } from "./types";
import { CSSProperties, HTMLAttributes, useMemo } from "react";

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
  effectivePalette
}: ConfluxPresenceProps) {
  const resolvedCommand = command ?? (mode ? modeToCommand(mode) : DEFAULT_COMMAND);
  
  // Merge effective palette into command if provided
  const mergedCommand = useMemo(() => {
    if (effectivePalette) {
      return { ...resolvedCommand, palette: effectivePalette };
    }
    const appPaletteEntry = appPalette ? APP_PALETTES[appPalette] : undefined;
    if (appPaletteEntry) {
      return { ...resolvedCommand, palette: appPaletteEntry };
    }
    return resolvedCommand;
  }, [resolvedCommand, effectivePalette, appPalette]);

  return (
    <div
      {...containerProps}
      className={className ?? containerProps?.className}
      style={style ?? containerProps?.style}
    >
      <NeuralBrainScene
        command={mergedCommand}
        pulseImpulse={pulseImpulse}
        pulseEvent={pulseEvent}
        transparent={transparent}
      />
    </div>
  );
}
