import { useState } from "react";
import useStable from "~/hooks/use-stable.ts";

export function useForceUpdate() {
  const [, setState] = useState(0);
  return useStable(() => setState((prev) => prev + 1));
}
