import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCommand,
  BrainMode,
  COMMANDS,
  DEFAULT_COMMAND
} from "../../lib/neuralBrain";
import {
  ConfluxExternalEvent,
  ConfluxStatusSource,
  PulseEventDetail,
  TokenCadenceDetail
} from "./types";

const modeToCommand = (mode: BrainMode) =>
  COMMANDS.find((entry) => entry.mode === mode) ?? DEFAULT_COMMAND;

export type UseConfluxControllerOptions = {
  initialMode?: BrainMode;
  initialStatus?: string;
  initialTransparent?: boolean;
};

export function useConfluxController(options: UseConfluxControllerOptions = {}) {
  const [command, setCommand] = useState<BrainCommand>(
    options.initialMode ? modeToCommand(options.initialMode) : DEFAULT_COMMAND
  );
  const [signalCount, setSignalCount] = useState(12);
  const [pulseImpulse, setPulseImpulse] = useState(0);
  const [pulseEvent, setPulseEvent] = useState<(PulseEventDetail & { id: number }) | undefined>();
  const [status, setStatus] = useState(options.initialStatus ?? "Conflux is dormant");
  const [transparent, setTransparent] = useState(options.initialTransparent ?? true);
  const cadenceTimersRef = useRef<number[]>([]);

  // Ref-stable callbacks: each ref holds the *latest* implementation.
  // The public-facing wrapper uses useCallback([], []) so it never changes identity.
  const clearCadenceTimers = useCallback(() => {
    cadenceTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    cadenceTimersRef.current = [];
  }, []);

  const setModeRef = useRef(
    (nextMode: BrainMode, source: ConfluxStatusSource = "manual", nextStatus?: string) => {
      const nextCommand = modeToCommand(nextMode);
      setCommand(nextCommand);
      setStatus(
        nextStatus ??
          (source === "manual"
            ? `Conflux shifted to ${nextCommand.label}`
            : `${source}: ${nextCommand.label}`)
      );
      setSignalCount((count) => count + Math.ceil(nextCommand.glowBoost * 2));
      setPulseImpulse((value) => value + 6 + nextCommand.glowBoost * 4);
    }
  );

  const triggerPulseRef = useRef((strength = 8, nextStatus = "Signal pulse") => {
    setSignalCount((count) => count + strength);
    setPulseImpulse((value) => value + strength);
    setStatus(nextStatus);
  });

  const routePulseRef = useRef(
    (
      detail: PulseEventDetail,
      nextStatus = "Directed pulse",
      opts?: { updateStatus?: boolean }
    ) => {
      const strength = detail.strength ?? 10;
      setSignalCount((count) => count + strength);
      setPulseImpulse((value) => value + strength * 0.8);
      setPulseEvent({
        id: Date.now() + Math.floor(Math.random() * 1000),
        ...detail
      });
      if (opts?.updateStatus !== false) {
        setStatus(nextStatus);
      }
    }
  );

  const runCadenceRef = useRef(
    (
      detail: TokenCadenceDetail,
      fallbackRoute: BrainCommand["activeLobes"],
      fallbackStatus: string,
      fallbackMode: BrainMode
    ) => {
      clearCadenceTimers();

      const tokens =
        detail.tokens && detail.tokens.length > 0
          ? detail.tokens
          : ["signal", "signal", "signal", "signal"];
      const route = detail.route ?? fallbackRoute;
      const intervalMs = detail.intervalMs ?? 110;
      const burstsPerToken = detail.burstsPerToken ?? 2;
      const strength = detail.strength ?? 9;

      setModeRef.current(fallbackMode, "manual", detail.status ?? fallbackStatus);

      tokens.forEach((_, index) => {
        const timer = window.setTimeout(() => {
          routePulseRef.current(
            {
              route,
              strength: strength + (index % 2 === 0 ? 1.2 : 0),
              bursts: burstsPerToken
            },
            detail.status ?? fallbackStatus,
            { updateStatus: false }
          );
        }, index * intervalMs);
        cadenceTimersRef.current.push(timer);
      });
    }
  );

  const resetRef = useRef(() => {
    clearCadenceTimers();
    setCommand(DEFAULT_COMMAND);
    setSignalCount(12);
    setPulseImpulse(0);
    setPulseEvent(undefined);
    setStatus(options.initialStatus ?? "Conflux is dormant");
  });

  // ── Stable wrapper functions ──────────────────────────────────────────
  const setMode = useCallback(
    (nextMode: BrainMode, source?: ConfluxStatusSource, nextStatus?: string) => {
      setModeRef.current(nextMode, source, nextStatus);
    },
    []
  );

  const triggerPulse = useCallback((strength?: number, nextStatus?: string) => {
    triggerPulseRef.current(strength, nextStatus);
  }, []);

  const routePulse = useCallback(
    (detail: PulseEventDetail, nextStatus?: string, opts?: { updateStatus?: boolean }) => {
      routePulseRef.current(detail, nextStatus, opts);
    },
    []
  );

  const runSpeechCadence = useCallback((detail: TokenCadenceDetail) => {
    runCadenceRef.current(
      detail,
      ["memory", "reasoning", "speech"],
      detail.status ?? "Speaking cadence",
      "speak"
    );
  }, []);

  const runListeningCadence = useCallback((detail: TokenCadenceDetail) => {
    runCadenceRef.current(
      detail,
      ["perception", "reasoning"],
      detail.status ?? "Listening cadence",
      "listen"
    );
  }, []);

  const applyEvent = useCallback(
    (event: ConfluxExternalEvent, source: ConfluxStatusSource = "backend") => {
      if (event.mode) {
        setModeRef.current(event.mode, source, event.status);
      }
      if (event.speechCadence) {
        runCadenceRef.current(
          event.speechCadence,
          ["memory", "reasoning", "speech"],
          event.speechCadence.status ?? "Speaking cadence",
          "speak"
        );
      }
      if (event.listeningCadence) {
        runCadenceRef.current(
          event.listeningCadence,
          ["perception", "reasoning"],
          event.listeningCadence.status ?? "Listening cadence",
          "listen"
        );
      }
      if (event.pulseEvent) {
        routePulseRef.current(event.pulseEvent, event.status ?? "Directed pulse");
      }
      if (event.pulse) {
        triggerPulseRef.current(event.pulse, event.status ?? "Signal pulse");
      }
    },
    []
  );

  const reset = useCallback(() => {
    resetRef.current();
  }, []);

  // Decay interval
  useEffect(() => {
    const decay = window.setInterval(() => {
      setPulseImpulse((value) => Math.max(0, value - 1.2));
    }, 90);
    return () => {
      window.clearInterval(decay);
      clearCadenceTimers();
    };
  }, [clearCadenceTimers]);

  return useMemo(
    () => ({
      command,
      mode: command.mode,
      pulseImpulse,
      pulseEvent,
      signalCount,
      status,
      transparent,
      setTransparent,
      setMode,
      triggerPulse,
      routePulse,
      runSpeechCadence,
      runListeningCadence,
      applyEvent,
      reset
    }),
    [
      command,
      pulseEvent,
      pulseImpulse,
      signalCount,
      status,
      transparent
    ]
  );
}
