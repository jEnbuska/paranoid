import { useRef } from "react";
import { useMemoOnce } from "~/hooks/use-memo-once";

/**
 * A hook that provides a timeout utility.
 * It allows you to set and clear timeouts.
 *
 * @returns An object with `set` and `clear` methods.
 */
export function useTimeout() {
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useMemoOnce(() => {
    return {
      set(callback: () => any, ms = 0) {
        timeout.current = setTimeout(callback, ms);
      },
      clear() {
        clearTimeout(timeout.current);
      },
    };
  });
}
