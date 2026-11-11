import { useState } from "react";

/**
 * Returns a callback that rethrows an error while rendering. An ErrorBoundary
 * only catches errors thrown while rendering, not those of async callbacks.
 */
export default function useReject() {
  const [thrown, setThrown] = useState<unknown>(undefined);
  if (thrown) throw thrown;
  return setThrown;
}
