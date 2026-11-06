export default function pick<K extends string, T extends Record<K, any>>(
  keys: K[],
  data: T,
): Pick<T, K>;
export default function pick<K extends string>(
  keys: K[],
): <T extends Record<K, any>>(data: T) => Pick<T, K>;
export default function pick(...args: any[]) {
  if (args.length === 1) {
    return (data: any) => {
      return pick(args[0], data);
    };
  }
  const [keys, data] = args;
  const partial = {} as any;
  for (const key of keys) {
    partial[key] = data[key];
  }
  return partial;
}
