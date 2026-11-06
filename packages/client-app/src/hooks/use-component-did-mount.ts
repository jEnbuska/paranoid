import { useRef, useEffect } from "react";

/**
 * A hook that runs a callback function only once when the component mounts.
 * It uses a ref to track if the component has mounted, ensuring the callback
 * is not called again on subsequent renders (React.StrictMode).
 */
export default function useComponentDidMount(callback: () => any) {
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    callback();
  }, []);
}
