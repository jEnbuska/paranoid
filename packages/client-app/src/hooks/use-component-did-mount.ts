import { useRef } from "react";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useReject from "~/hooks/use-reject.ts";

/**
 * A hook that runs a callback function only once when the component mounts.
 * It uses a ref to track if the component has mounted, ensuring the callback
 * is not called again on subsequent renders (React.StrictMode).
 */
export default function useComponentDidMount(callback: () => any) {
  const mounted = useRef(false);
  const reject = useReject();
  useAbortableEffect((signal) => {
    if (mounted.current) return;
    mounted.current = true;
    queueMicrotask(() => {
      if (signal.aborted) return;
      try {
        callback();
      } catch (e) {
        reject(e);
      }
    });
  }, []);
}
