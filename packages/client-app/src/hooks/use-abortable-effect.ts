import { DependencyList, useEffect } from "react";
import useReject from "~/hooks/use-reject.ts";

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
        reject(e);
      }
    });
    return () => {
      controller.abort();
    };
  }, deps);
}
