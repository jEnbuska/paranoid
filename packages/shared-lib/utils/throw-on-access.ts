const proxy: any = new Proxy(
  {},
  {
    get(_, p): any {
      throw new Error(
        `You are trying to access ${String(p)} from non provided context.`,
      );
    },
  },
);

export default function throwOnAccess<
  Data extends Record<PropertyKey, any>,
>(): Data {
  return proxy;
}
