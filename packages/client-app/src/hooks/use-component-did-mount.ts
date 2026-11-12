import { useRef, useEffect } from "react";
import { useAbortController } from "~/hooks/use-abort-controller";
import useReject from "~/hooks/use-reject.ts";
import invoke from "shared-lib/utils/invoke";

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
export default function useComponentDidMount(
  callback: (signal: AbortSignal) => void | Promise<void>,
) {
  const reject = useReject();
  const mounted = useRef(false);
  const { signal } = useAbortController();
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    // async, so that a synchronous throw rejects too
    invoke(async () => callback(signal)).catch((error) => {
      if (!signal.aborted) reject(error);
    });
  }, []);
}
