import { useEffect, type DependencyList } from "react";
import useRunEffect, { type EffectCallback } from "~/hooks/use-run-effect.ts";

/**
 * `useEffect` for effects that do async work or add listeners, and run again
 * when `deps` change. Each run gets its own `AbortSignal`, which aborts when
 * the run is cleaned up: when `deps` change or the component unmounts.
 *
 * ```ts
 * useAsyncEffect(
 *   async (signal) => {
 *     channel.addEventListener("close", onClose, { signal });
 *   },
 *   [channel],
 * );
 * ```
 *
 * A rejection after the signal has aborted is ignored. Any other rejection is
 * rethrown while rendering, so the nearest error boundary catches it.
 *
 * In development, React.StrictMode runs the effect, cleans it up and runs it
 * again, so the first run's signal aborts right away. Check `signal.aborted`
 * before anything that must not happen twice, such as sending a message. For
 * work that runs once on mount, use `useComponentDidMount` instead.
 *
 * @param effect - Called on every run with that run's signal.
 * @param deps - Like `useEffect`'s. Leaving it out runs the effect on mount.
 */
export default function useAsyncEffect(
  effect: EffectCallback,
  deps: DependencyList = [],
) {
  const run = useRunEffect();
  useEffect(() => {
    const controller = new AbortController();
    run(effect, controller.signal);
    return () => controller.abort();
  }, deps);
}
