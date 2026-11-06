/** Function that returns an imperatively resolvable promise with signal */
export default function createResolvable<T = void>(
  signal?: AbortController["signal"],
): PromiseWithResolvers<T> {
  const { resolve, reject, ...rest } = Promise.withResolvers<T>();
  return {
    reject(e: any) {
      if (signal?.aborted) return;
      reject(e);
    },
    resolve<T>(data: T | PromiseLike<T>) {
      if (signal?.aborted) return;
      resolve(data as any);
    },
    ...rest,
  };
}
