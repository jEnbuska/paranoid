import { useEffect } from "react";
import useUpdateCallback from "~/hooks/use-stable.ts";
import { useTimeout } from "~/hooks/use-timeout";

/**
 * A hook that runs the provided cleanup function when the component is unmounted.
 * It uses a timeout to ensure that the cleanup function is called after the component
 * has been unmounted.
 *
 * @param cleanup - The cleanup function to be called on unmount.
 */
export function useComponentDidUnmount(cleanup: () => any) {
  const callback = useUpdateCallback(cleanup);
  const timeout = useTimeout();
  // Clear the timeout when the component is mounted twice (React.StrictMode)
  useEffect(() => {
    timeout.clear();
    return () => {
      timeout.set(callback);
    };
  }, []);
}
