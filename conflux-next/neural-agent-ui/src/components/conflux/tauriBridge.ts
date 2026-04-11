import { ConfluxExternalEvent } from "./types";

export type ConfluxTauriUnlisten = () => void | Promise<void>;

export type ConfluxTauriListen = <T>(
  event: string,
  handler: (event: { event: string; id: number; payload: T }) => void
) => Promise<ConfluxTauriUnlisten>;

type EventConsumer = (event: ConfluxExternalEvent, source?: "backend" | "system" | "manual") => void;

export async function attachTauriConfluxListeners(
  listen: ConfluxTauriListen,
  applyEvent: EventConsumer,
  eventNames: { state?: string; pulse?: string } = {}
) {
  const stateEventName = eventNames.state ?? "conflux:state";
  const pulseEventName = eventNames.pulse ?? "conflux:pulse";

  const unlistenState = await listen<ConfluxExternalEvent>(stateEventName, (event) => {
    applyEvent(event.payload, "backend");
  });

  const unlistenPulse = await listen<ConfluxExternalEvent>(pulseEventName, (event) => {
    applyEvent(event.payload, "backend");
  });

  return {
    async dispose() {
      await Promise.all([Promise.resolve(unlistenState()), Promise.resolve(unlistenPulse())]);
    }
  };
}
