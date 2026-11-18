import { useCallback, useInsertionEffect, useRef } from "react";

/** Returns a memoized callback function that's reference is always the same
 * though when called it invokes the latest version of the provided callback.
 * The latest callback is in place before any effect runs, but not during
 * render, so don't call the returned function while rendering */
export default function useStable<T extends any[], R>(cb: (...args: T) => R) {
  const ref = useRef(cb);
  // Updated at commit rather than during render, which React's rules for refs
  // don't allow. Insertion effects run before every layout and passive effect,
  // so the effects of this component and its children see the latest callback
  useInsertionEffect(() => {
    ref.current = cb;
  });
  return useCallback((...args: T) => ref.current(...args), []);
}
