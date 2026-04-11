import { useEffect, type HTMLAttributes, type CSSProperties } from "react";
import { ConfluxPresence } from "./ConfluxPresence";
import { attachTauriConfluxListeners, type ConfluxTauriListen } from "./tauriBridge";
import { useConfluxController, type UseConfluxControllerOptions } from "./useConfluxController";

export type ConfluxTauriHostProps = UseConfluxControllerOptions & {
  listen: ConfluxTauriListen;
  eventNames?: {
    state?: string;
    pulse?: string;
  };
  className?: string;
  style?: CSSProperties;
  containerProps?: HTMLAttributes<HTMLDivElement>;
};

export function ConfluxTauriHost({
  listen,
  eventNames,
  className,
  style,
  containerProps,
  initialMode,
  initialStatus,
  initialTransparent
}: ConfluxTauriHostProps) {
  const controller = useConfluxController({
    initialMode,
    initialStatus,
    initialTransparent
  });

  useEffect(() => {
    let disposed = false;
    let cleanup: { dispose: () => Promise<void> } | undefined;

    attachTauriConfluxListeners(listen, controller.applyEvent, eventNames).then((bridge) => {
      if (disposed) {
        void bridge.dispose();
        return;
      }
      cleanup = bridge;
    });

    return () => {
      disposed = true;
      void cleanup?.dispose();
    };
  }, [controller.applyEvent, eventNames, listen]);

  return (
    <ConfluxPresence
      command={controller.command}
      pulseImpulse={controller.pulseImpulse}
      pulseEvent={controller.pulseEvent}
      transparent={controller.transparent}
      className={className}
      style={style}
      containerProps={containerProps}
    />
  );
}
