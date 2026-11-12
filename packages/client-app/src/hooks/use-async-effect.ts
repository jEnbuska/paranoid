import { useEffect, type DependencyList } from "react";
import useReject from "~/hooks/use-reject.ts";
import invoke from "shared-lib/utils/invoke";

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
 * @param deps - Like `useEffect`'s, and required: list everything the effect
 *   reads that can change, so it never keeps using stale values.
 */
export default function useAsyncEffect(
  effect: (signal: AbortSignal) => void | Promise<void>,
  deps: DependencyList,
) {
  const reject = useReject();
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    // async, so that a synchronous throw rejects too
    invoke(async () => effect(signal)).catch((error) => {
      if (!signal.aborted) reject(error);
    });
    return () => controller.abort();
  }, deps);
}
