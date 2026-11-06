import { useRef } from "react";

const NOT_SET = Symbol("NOT_SET");

/**
 * A hook that memoizes a value and ensures it is only computed once.
 * It uses a ref to store the value and returns the same value on subsequent renders (React.StrictMode).
 *
 * @param cb - A function that computes the value to be memoized.
 * @returns The memoized value.
 */
export function useMemoOnce<T>(cb: () => T): T {
  const ref = useRef<T | symbol>(NOT_SET);
  if (ref.current === NOT_SET) {
    ref.current = cb();
  }
  return ref.current as T;
}
