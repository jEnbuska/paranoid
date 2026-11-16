import { useMemoOnce } from "~/hooks/use-memo-once";
import { useAbortableEffect } from "~/hooks/use-abortable-effect";

/**
 * A hook that provides an AbortController instance.
 * The controller is automatically aborted when the component is unmounted.
 */
export function useAbortController() {
  const controller = useMemoOnce(() => new AbortController());
  useAbortableEffect((signal) => {
    signal.addEventListener("abort", () => controller.abort());
  }, []);
  return controller;
}
