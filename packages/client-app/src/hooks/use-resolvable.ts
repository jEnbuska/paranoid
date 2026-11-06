import { useMemoOnce } from "~/hooks/use-memo-once";
import { useAbortController } from "~/hooks/use-abort-controller";
import createResolvable from "shared-lib/utils/create-resolvable";

export function useResolvable<T = void>() {
  const { signal } = useAbortController();
  return useMemoOnce(() => createResolvable<T>(signal));
}
