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
  onTTSAudio?: (audioData: { audio_base64: string; sample_rate: number }) => void,
  eventNames: { state?: string; pulse?: string; tts?: string } = {}
) {
  const stateEventName = eventNames.state ?? "conflux:state";
  const pulseEventName = eventNames.pulse ?? "conflux:pulse";
  const ttsEventName = eventNames.tts ?? "conflux:tts-audio";

  const unlistenState = await listen<ConfluxExternalEvent>(stateEventName, (event) => {
    applyEvent(event.payload, "backend");
  });

  const unlistenPulse = await listen<ConfluxExternalEvent>(pulseEventName, (event) => {
    applyEvent(event.payload, "backend");
  });

  let unlistenTTS: (() => void) | undefined;
  if (onTTSAudio) {
    unlistenTTS = await listen<{ audio_base64: string; sample_rate: number }>(ttsEventName, (event) => {
      onTTSAudio(event.payload);
    });
  }

  return {
    async dispose() {
      await Promise.all([
        Promise.resolve(unlistenState()), 
        Promise.resolve(unlistenPulse()),
        unlistenTTS ? Promise.resolve(unlistenTTS()) : Promise.resolve()
      ]);
    }
  };
}
