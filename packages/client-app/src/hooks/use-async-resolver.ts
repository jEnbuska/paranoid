import { useAbortController } from "~/hooks/use-abort-controller";

/**
 * A hook that provides a function to resolve a promise with an abort controller.
 * Promises provided are only resolved if the component is still mounted.
 */
export default function useAsyncResolver() {
  const controller = useAbortController();
  return function asyncTask<T>(promise: Promise<T>) {
    return new Promise<T>((resolve, reject) =>
      promise
        .then((result) => {
          if (controller.signal.aborted) return;
          resolve(result);
        })
        .catch((e) => {
          if (controller.signal.aborted) return;
          reject(e);
        }),
    );
  };
}
