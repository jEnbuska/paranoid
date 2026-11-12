import { useEffect, useRef } from "react";
import useStable from "~/hooks/use-stable.ts";

/**
 * Runs `cleanup` when the component unmounts, but not when React.StrictMode
 * only pretends to unmount it in development. Use it for cleanup that must
 * happen once, such as telling the server. `useAsyncEffect`'s signal aborts
 * on StrictMode's pretend unmount too; `useComponentDidMount`'s doesn't.
 *
 * The cleanup waits a timeout, which StrictMode's immediate remount cancels.
 *
 * @param cleanup - The cleanup function to be called on unmount.
 */
export function useComponentDidUnmount(cleanup: () => any) {
  const callback = useStable(cleanup);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timeout.current);
    return () => {
      timeout.current = setTimeout(callback);
    };
  }, []);
}
