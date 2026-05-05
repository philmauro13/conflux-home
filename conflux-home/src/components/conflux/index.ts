export { ConfluxPresence } from "./ConfluxPresence";
export type { FairyExpression, FairyNudge } from "./ConfluxPresence";
export { ConfluxDebugPanel } from "./ConfluxDebugPanel";
export { ConfluxTauriHost } from "./ConfluxTauriHost";
export { useConfluxController } from "./useConfluxController";
export {
  bindConfluxWindowEvents,
  emitConfluxPulseEvent,
  emitConfluxStateEvent,
  type ConfluxWindowBridge,
  type ConfluxWindowEventName
} from "./windowBridge";
export {
  attachTauriConfluxListeners,
  type ConfluxTauriListen,
  type ConfluxTauriUnlisten
} from "./tauriBridge";
export type {
  BrainCommand,
  BrainMode,
  ConfluxTauriHostProps,
  ConfluxExternalEvent,
  ConfluxStatusSource,
  LobeName,
  PulseEventDetail,
  TokenCadenceDetail,
  UseConfluxControllerOptions
} from "./types";
