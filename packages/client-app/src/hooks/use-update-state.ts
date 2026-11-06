import { useState, useRef, useEffect } from "react";
import useStable from "~/hooks/use-stable.ts";
import useAsyncResolver from "~/hooks/use-async-resolver";
import createResolvable from "shared-lib/utils/create-resolvable";
import always from "shared-lib/utils/always";

/**
 * A custom hook that manages state and provides an asynchronous update function.
 * It allows you to update the state and wait for the update to be resolved.
 * When invoked with a partial state it only updates the provided properties.
 * Example:
 * ```ts
 * const [state, updateState, getState] = useUpdateState({ count: 0, name: "John" });
 * ...
 * const handleClick = async () => {
 *   const { count } = getState(); // { count: 0, name: "John" }
 *   await updateState({ count: count + 1 });
 *   console.log(getState()); // { count: 1, name: "John" }
 *   await updateState({ name: "Doe" });
 *   console.log(getState()); // { count: 1, name: "Doe" }
 * }
 *
 * @param initialState - The initial state or a function that returns the initial state.
 * @returns An array containing the current state, an update function, and a getter function for the state.
 */
export default function useUpdateState<T extends Record<string, any>>(
  initialState: T | (() => T),
) {
  const [state, setState] = useState<T>(initialState);
  const resolvable = useRef<Array<() => void>>([]);
  const resolver = useAsyncResolver();

  useEffect(() => {
    resolvable.current.forEach((cb) => cb());
    resolvable.current = [];
  }, [state]);
  const updateState = useStable(async (update: Partial<T>) => {
    const { resolve, promise } = await createResolvable();
    setState((prevState) => ({ ...prevState, ...update }));
    resolvable.current.push(resolve);
    // Wrapping state update in a promise to ensure that promise is not resolved
    // until the state is updated, and if the component is unmounted before that
    // the promise is not resolved
    return resolver(promise);
  });
  const getState = useStable(always(state));
  return [state, updateState, getState] as const;
}
