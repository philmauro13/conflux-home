import { NeuralBrainScene } from "../NeuralBrainScene";
import { BrainCommand, BrainMode } from "./types";
import { COMMANDS, DEFAULT_COMMAND } from "../../lib/neuralBrain";
import { PulseEventDetail } from "./types";
import { CSSProperties, HTMLAttributes } from "react";

type ConfluxPresenceProps = {
  mode?: BrainMode;
  command?: BrainCommand;
  pulseImpulse: number;
  pulseEvent?: PulseEventDetail & { id: number };
  transparent?: boolean;
  className?: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
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
  containerProps
}: ConfluxPresenceProps) {
  const resolvedCommand = command ?? (mode ? modeToCommand(mode) : DEFAULT_COMMAND);

  return (
    <div
      {...containerProps}
      className={className ?? containerProps?.className}
      style={style ?? containerProps?.style}
    >
      <NeuralBrainScene
        command={resolvedCommand}
        pulseImpulse={pulseImpulse}
        pulseEvent={pulseEvent}
        transparent={transparent}
      />
    </div>
  );
}
