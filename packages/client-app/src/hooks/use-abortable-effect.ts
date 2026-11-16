import { DependencyList, useEffect } from "react";
import useReject from "~/hooks/use-reject.ts";

/**
 * Like `useEffect`, but the callback gets an `AbortSignal` and runs in a
 * microtask after the effect.
 *
 * - Every effect run gets its own signal. Its cleanup aborts it, which happens
 *   when the component unmounts and before the next run when `deps` change.
 *   Pass it to `fetch`, `addEventListener(..., { signal })` and the like.
 * - `deps` works as in `useEffect`: leave it out to run after every render,
 *   pass `[]` to run once.
 * - React.StrictMode runs an effect, cleans it up and runs it again in
 *   development. The first run's signal is aborted before its microtask runs,
 *   so the callback is skipped and runs once, with the second run's signal.
 *   Anything the callback does is safe to send or start without a
 *   `signal.aborted` check at the top.
 * - The callback may be async. An error it throws or rejects with goes to the
 *   error boundary through `useReject`, unless the signal has aborted by then:
 *   an aborted `fetch` or `inbox.take` rejects on purpose, so that is ignored.
 * - The cleanup only aborts the signal. The callback has to pass it on or
 *   check `signal.aborted` after each `await`, or it keeps going after it was
 *   cancelled.
 */
export function useAbortableEffect(
  cb: (signal: AbortSignal) => any,
  deps?: DependencyList,
) {
  const reject = useReject();
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(async () => {
      if (controller.signal.aborted) return;
      try {
        await cb(controller.signal);
      } catch (e) {
        if (controller.signal.aborted) return;
        reject(e);
      }
    });
    return () => {
      controller.abort();
    };
  }, deps);
}
