import { useCallback, useRef } from "react";

/** Returns a memoized callback function that's reference is always the same
 * though when called it invokes the latest version of the provided callback */
export default function useStable<T extends any[], R>(cb: (...args: T) => R) {
  const ref = useRef(cb);
  // Assigned during render, not in an effect: the function may be called during
  // render, and an effect would leave it calling the previous render's callback
  // until the commit
  ref.current = cb;
  return useCallback((...args: T) => ref.current(...args), []);
}
