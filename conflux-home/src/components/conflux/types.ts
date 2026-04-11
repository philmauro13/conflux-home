import type {
  BrainCommand,
  BrainMode,
  LobeName,
  PulseEventDetail,
  TokenCadenceDetail,
  PaletteName
} from "../../lib/neuralBrain";
import type { ConfluxTauriHostProps } from "./ConfluxTauriHost";
import type { UseConfluxControllerOptions } from "./useConfluxController";

export type {
  BrainCommand,
  BrainMode,
  ConfluxTauriHostProps,
  LobeName,
  PulseEventDetail,
  TokenCadenceDetail,
  UseConfluxControllerOptions
};

export type ConfluxExternalEvent = {
  mode?: BrainMode;
  pulse?: number;
  pulseImpulse?: number;
  status?: string;
  pulseEvent?: PulseEventDetail;
  speechCadence?: TokenCadenceDetail;
  listeningCadence?: TokenCadenceDetail;
  appPalette?: string | PaletteName;
};

export type ConfluxStatusSource = "manual" | "backend" | "system";
