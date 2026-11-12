import { useRef, useEffect } from "react";
import { useAbortController } from "~/hooks/use-abort-controller";
import useRunEffect, { type EffectCallback } from "~/hooks/use-run-effect.ts";

/**
 * Runs a callback once when the component mounts, also under
 * React.StrictMode, which mounts components twice in development. Use it for
 * work that must happen only once, such as sending a message or listening for
 * events for the component's whole life.
 *
 * ```ts
 * useComponentDidMount(async (signal) => {
 *   channel.addEventListener("close", onClose, { signal });
 * });
 * ```
 *
 * The signal aborts when the component really unmounts, not on StrictMode's
 * pretend unmount. A rejection after it has aborted is ignored. Any other
 * rejection is rethrown while rendering, so the nearest error boundary
 * catches it.
 */
export default function useComponentDidMount(callback: EffectCallback) {
  const run = useRunEffect();
  const mounted = useRef(false);
  const { signal } = useAbortController();
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    run(callback, signal);
  }, []);
}
