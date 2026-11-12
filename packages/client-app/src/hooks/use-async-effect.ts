import { useEffect, type DependencyList } from "react";
import useReject from "~/hooks/use-reject.ts";

/**
 * `useEffect` for effects that do async work or add listeners. Each run gets
 * its own `AbortSignal`, which aborts when the run is cleaned up: when `deps`
 * change or the component unmounts.
 *
 * ```ts
 * useAsyncEffect(async (signal) => {
 *   channel.addEventListener("close", onClose, { signal });
 *   const args = await inbox.take("DONE", signal);
 * });
 * ```
 *
 * A rejection after the signal has aborted is ignored. Any other rejection is
 * rethrown while rendering, so the nearest error boundary catches it.
 *
 * In development, React.StrictMode runs the effect, cleans it up and runs it
 * again, so the first run's signal aborts right away. Check `signal.aborted`
 * before anything that must not happen twice, such as sending a message.
 *
 * @param effect - Called on every run with that run's signal.
 * @param deps - Like `useEffect`'s. Leaving it out runs the effect on mount.
 */
export default function useAsyncEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: DependencyList = [],
) {
  const reject = useReject();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void invokeEffect(effect, signal).catch((error) => {
      if (!signal.aborted) reject(error);
    });
    return () => controller.abort();
  }, deps);
}

/** Runs the effect so that a synchronous throw rejects too */
async function invokeEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  signal: AbortSignal,
) {
  await effect(signal);
}
