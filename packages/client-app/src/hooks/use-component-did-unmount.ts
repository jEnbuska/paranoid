import { useEffect, useRef } from "react";
import useUpdateCallback from "~/hooks/use-stable.ts";

/**
 * A hook that runs the provided cleanup function when the component is unmounted.
 * It uses a timeout to ensure that the cleanup function is called after the component
 * has been unmounted.
 *
 * @param cleanup - The cleanup function to be called on unmount.
 */
export function useComponentDidUnmount(cleanup: () => any) {
  const callback = useUpdateCallback(cleanup);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (mounted.current) return;
        callback();
      });
    };
  }, []);
}
