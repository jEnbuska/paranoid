import { useCallback, useState } from "react";

/**
 * Returns a callback that rethrows an error while rendering. An ErrorBoundary
 * only catches errors thrown while rendering, not those of async callbacks.
 */
export default function useThrowToErrorBoundary() {
  const [thrown, setThrown] = useState<{ error: unknown }>();
  const throwToErrorBoundary = useCallback(
    (error: unknown) => setThrown({ error }),
    [],
  );
  if (thrown) throw thrown.error;
  return throwToErrorBoundary;
}
