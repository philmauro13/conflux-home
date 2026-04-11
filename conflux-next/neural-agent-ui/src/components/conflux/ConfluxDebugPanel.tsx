import { COMMANDS } from "../../lib/neuralBrain";
import { useConfluxController } from "./useConfluxController";

type ConfluxDebugPanelProps = {
  controller: ReturnType<typeof useConfluxController>;
};

export function ConfluxDebugPanel({ controller }: ConfluxDebugPanelProps) {
  return (
    <>
      <div className="command-grid">
        {COMMANDS.map((entry, index) => (
          <button
            key={entry.label}
            className={entry.mode === controller.mode ? "command active" : "command"}
            onClick={() => controller.setMode(entry.mode)}
            type="button"
          >
            <span>{entry.label}</span>
            <small>{index + 1}</small>
          </button>
        ))}
      </div>

      <div className="signal-row">
        <button
          className="pulse-button"
          onClick={() => controller.triggerPulse(12, "Manual signal burst")}
          type="button"
        >
          Trigger pulse
        </button>
        <button
          className="pulse-button secondary"
          onClick={() => controller.setMode("speak")}
          type="button"
        >
          Simulate speaking
        </button>
        <button
          className="pulse-button ghost"
          onClick={() =>
            controller.routePulse(
              {
                route: ["perception", "reasoning", "tools"],
                strength: 14,
                bursts: 4
              },
              "Perception to tools route"
            )
          }
          type="button"
        >
          Route tool pulse
        </button>
        <button
          className="pulse-button ghost"
          onClick={() =>
            controller.routePulse(
              {
                route: ["memory", "reasoning", "speech"],
                strength: 13,
                bursts: 4
              },
              "Memory to speech route"
            )
          }
          type="button"
        >
          Route speech pulse
        </button>
        <button
          className="pulse-button secondary"
          onClick={() =>
            controller.runSpeechCadence({
              tokens: ["hello", "this", "is", "conflux"],
              route: ["memory", "reasoning", "speech"],
              intervalMs: 118,
              strength: 11,
              burstsPerToken: 3
            })
          }
          type="button"
        >
          Simulate TTS
        </button>
        <button
          className="pulse-button"
          onClick={() =>
            controller.runListeningCadence({
              tokens: ["incoming", "voice", "signal", "detected"],
              route: ["perception", "reasoning"],
              intervalMs: 92,
              strength: 9,
              burstsPerToken: 2
            })
          }
          type="button"
        >
          Simulate STT
        </button>
        <button
          className="pulse-button ghost"
          onClick={() => controller.setTransparent((value) => !value)}
          type="button"
        >
          {controller.transparent ? "Preview solid bg" : "Preview transparent"}
        </button>
        <div className="readout">
          <span>Status</span>
          <strong>{controller.status}</strong>
        </div>
        <div className="readout">
          <span>Signals</span>
          <strong>{controller.signalCount}</strong>
        </div>
      </div>
    </>
  );
}
