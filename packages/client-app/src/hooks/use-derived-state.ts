import { useState, useMemo, useRef, useCallback, DependencyList } from "react";

type GetInitialState<T> = T | (() => T);

function getInitialState<T>(initialState: GetInitialState<T>): T {
  if (typeof initialState === "function") {
    return (initialState as () => T)();
  } else {
    return initialState;
  }
}

function getNextState<T>(prevState: T, updater: T | ((prevState: T) => T)): T {
  if (typeof updater === "function") {
    return (updater as (prevState: T) => T)(prevState);
  }
  return updater;
}
/**
 * A custom hook that manages a derived state based on the provided dependencies.
 * It allows the state to be automatically updated without re-render based on
 * provided value when the dependencies change.
 * Example:
 * ```ts
 * const [state, setState] = useDerivedState({ count: props.count }, [props.count]);
 * ```
 * @param initialState - The initial state or a function that returns the initial state.
 * @param deps - An array of dependencies that will trigger a re-evaluation of the state.
 * @returns An array containing the current state and a function to update the state.
 */
export default function useDerivedState<T>(
  initialState: T | (() => T),
  deps: DependencyList,
): [T, (updater: ((prevState: T) => T) | T) => void] {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  useMemo(() => {
    stateRef.current = getInitialState(initialState);
  }, deps);

  return [
    stateRef.current,
    useCallback(
      (updater) =>
        setState(
          (prevState) => (stateRef.current = getNextState(prevState, updater)),
        ),
      [setState],
    ),
  ];
}
