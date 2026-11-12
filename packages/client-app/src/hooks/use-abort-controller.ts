import { useMemoOnce } from "~/hooks/use-memo-once";
import { useComponentDidUnmount } from "~/hooks/use-component-did-unmount";

/**
 * A hook that provides an AbortController instance.
 * The controller is automatically aborted when the component is unmounted.
 */
export function useAbortController() {
  const controller = useMemoOnce(() => new AbortController());
  useComponentDidUnmount(() => controller.abort());
  return controller;
}
