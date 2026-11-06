const valueKey = Symbol("value");

export default function memoize<Args extends any[], R>(
  callback: (...args: Args) => R,
) {
  const map = new Map<any, any>();
  return (...args: Args): R => {
    const result = getCachedValue<Args>(map, args);
    if (result?.has(valueKey)) return result.get(valueKey);
    const value = callback(...args);
    setToCache(map, args, value);
    return value;
  };
}

function getCachedValue<Args extends any[]>(
  cache: Map<any, any> | undefined,
  args: Args,
): Map<any, any> | undefined {
  if (!cache) return undefined;
  if (!args.length) {
    return cache;
  }
  const [key, ...rest] = args;
  return getCachedValue(cache.get(key), rest);
}

function setToCache<Args extends any[], R>(
  cache: Map<any, any>,
  args: Args,
  value: R,
): void {
  if (!args.length) {
    cache.set(valueKey, value);
    return;
  }
  const [key, ...rest] = args;
  if (!cache.has(key)) {
    cache.set(key, new Map());
  }
  return setToCache(cache.get(key), rest, value);
}
