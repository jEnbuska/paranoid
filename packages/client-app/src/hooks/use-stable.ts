import { useCallback } from "react";
import useUpdatedRef from "~/hooks/use-updated-ref";

/** Returns a memoized callback function that's reference is always the same
 * though when called it invokes the latest version of the provided callback */
export default function useStable<T extends any[], R>(cb: (...args: T) => R) {
  const ref = useUpdatedRef(cb);
  return useCallback((...args: T) => ref.current(...args), []);
}
