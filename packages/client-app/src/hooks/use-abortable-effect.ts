import { DependencyList, useEffect } from "react";

export function useAbortableEffect(
  cb: (signal: AbortSignal) => any,
  deps?: DependencyList,
) {
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      cb(controller.signal);
    });
    return () => {
      controller.abort();
    };
  }, deps);
}
