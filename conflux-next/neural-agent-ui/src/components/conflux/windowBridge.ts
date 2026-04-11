import { ConfluxExternalEvent } from "./types";

export type ConfluxWindowEventName = "conflux:state" | "conflux:pulse";

export type ConfluxWindowBridge = {
  dispose: () => void;
};

type EventTargetLike = Pick<Window, "addEventListener" | "removeEventListener" | "dispatchEvent">;

type EventConsumer = (event: ConfluxExternalEvent, source?: "backend" | "system" | "manual") => void;

export function emitConfluxStateEvent(
  detail: ConfluxExternalEvent,
  target: EventTargetLike = window
) {
  target.dispatchEvent(new CustomEvent("conflux:state", { detail }));
}

export function emitConfluxPulseEvent(
  detail: ConfluxExternalEvent,
  target: EventTargetLike = window
) {
  target.dispatchEvent(new CustomEvent("conflux:pulse", { detail }));
}

export function bindConfluxWindowEvents(
  applyEvent: EventConsumer,
  target: EventTargetLike = window
): ConfluxWindowBridge {
  const onState = (event: Event) => {
    applyEvent((event as CustomEvent<ConfluxExternalEvent>).detail, "backend");
  };

  const onPulse = (event: Event) => {
    applyEvent((event as CustomEvent<ConfluxExternalEvent>).detail, "backend");
  };

  target.addEventListener("conflux:state", onState as EventListener);
  target.addEventListener("conflux:pulse", onPulse as EventListener);

  return {
    dispose() {
      target.removeEventListener("conflux:state", onState as EventListener);
      target.removeEventListener("conflux:pulse", onPulse as EventListener);
    }
  };
}
