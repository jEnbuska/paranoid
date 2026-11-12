import useReject from "~/hooks/use-reject.ts";
import useStable from "~/hooks/use-stable.ts";

/** The callback of `useAsyncEffect` and `useComponentDidMount` */
export type EffectCallback = (signal: AbortSignal) => void | Promise<void>;

/**
 * Returns a function that runs an effect callback with a signal. A rejection,
 * or a synchronous throw, after the signal has aborted is ignored. Any other
 * is rethrown while rendering, so the nearest error boundary catches it.
 */
export default function useRunEffect() {
  const reject = useReject();
  return useStable((effect: EffectCallback, signal: AbortSignal) => {
    void invokeEffect(effect, signal).catch((error) => {
      if (!signal.aborted) reject(error);
    });
  });
}

/** Runs the effect so that a synchronous throw rejects too */
async function invokeEffect(effect: EffectCallback, signal: AbortSignal) {
  await effect(signal);
}
