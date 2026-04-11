import { useEffect } from "react";
import {
  ConfluxDebugPanel,
  ConfluxPresence,
  bindConfluxWindowEvents,
  useConfluxController
} from "./components/conflux";

export default function App() {
  const controller = useConfluxController({
    initialStatus: "Conflux is dormant",
    initialTransparent: true
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key >= "1" && key <= "7") {
        const modes = ["idle", "listen", "focus", "speak", "excited", "compact", "expanded"] as const;
        controller.setMode(modes[Number(key) - 1]);
      }
      if (key === "p") {
        controller.triggerPulse(10, "Manual neural burst");
      }
      if (key === "m") {
        controller.routePulse(
          { lobe: "memory", strength: 12, bursts: 8 },
          "Memory lobe pulse"
        );
      }
      if (key === "s") {
        controller.routePulse(
          { lobe: "speech", strength: 12, bursts: 8 },
          "Speech lobe pulse"
        );
      }
      if (key === "r") {
        controller.routePulse(
          {
            route: ["perception", "reasoning", "tools"],
            strength: 14,
            bursts: 4
          },
          "Perception to tools route"
        );
      }
      if (key === "k") {
        controller.runSpeechCadence({
          tokens: ["conflux", "is", "speaking", "now"],
          route: ["memory", "reasoning", "speech"],
          intervalMs: 120,
          strength: 11,
          burstsPerToken: 3
        });
      }
      if (key === "l") {
        controller.runListeningCadence({
          tokens: ["user", "input", "being", "heard"],
          route: ["perception", "reasoning"],
          intervalMs: 92,
          strength: 9,
          burstsPerToken: 2
        });
      }
      if (key === "t") {
        controller.setTransparent((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const bridge = bindConfluxWindowEvents(controller.applyEvent);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      bridge.dispose();
    };
  }, [controller]);

  return (
    <main className={controller.transparent ? "shell transparent-preview" : "shell"}>
      <section className="hero-copy">
        <p className="eyebrow">Conflux Core Demo Shell</p>
        <h1>Conflux Core and adapters are now separated cleanly.</h1>
        <p className="lede">
          The visual brain, controller logic, cadence scheduling, and debug
          controls are now separated so your application can embed the editable,
          resizable core component cleanly while other agents drive it with data.
        </p>

        <ConfluxDebugPanel controller={controller} />
      </section>

      <section className="viewport-card">
        <div className="canvas-frame">
          <ConfluxPresence
            pulseImpulse={controller.pulseImpulse}
            pulseEvent={controller.pulseEvent}
            command={controller.command}
            transparent={controller.transparent}
            style={{ width: "100%", height: "100%" }}
          />
          <div className="overlay">
            <div className="overlay-chip">Conflux Core Preview</div>
            <div className="overlay-chip">
              Active lobes: {controller.command.activeLobes.join(" / ")}
            </div>
            <div className="overlay-chip">Press 1-7, P, M, S, R, K, L, or T</div>
          </div>
        </div>
      </section>

      <section className="ideas-panel">
        <article>
          <h2>Embeddable Core</h2>
          <p>
            `ConfluxPresence` is now the embeddable visual component, and the
            scheduling logic moved into `useConfluxController` so apps can drive
            Conflux without copying internal timing code.
          </p>
        </article>
        <article>
          <h2>Transport Adapters</h2>
          <p>
            Other agents can control the brain through the hook methods, the
            built-in window event bridge, or the Tauri listener adapter without
            modifying the rendering internals.
          </p>
        </article>
        <article>
          <h2>Debug Shell</h2>
          <p>
            The buttons and overlay are now just a demo shell. They are optional
            and can be removed entirely in your real application.
          </p>
        </article>
      </section>
    </main>
  );
}
