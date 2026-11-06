export type RandomName<Prefix extends string> = `${Prefix}???`;
export type RandomNameData<T> =
  T extends Record<PropertyKey, unknown>
    ? {
        [K in keyof T as RandomName<string & K>]: RandomNameData<T[K]>;
      }
    : T;

export type RandomKeysData<T extends string> = {
  [K in T]: RandomName<K>;
};
