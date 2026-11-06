import { useRef, useMemo } from "react";
import { RandomKeysData, RandomName } from "~/features/random-name/types";
import { useMemoOnce } from "~/hooks/use-memo-once";

export function useRandomNames<T extends string>(
  ...names: ReadonlyArray<T>
): RandomKeysData<T> {
  const ref = useRef<ReadonlyArray<T>>(names);
  useMemo(() => {
    if (names.length !== ref.current.length)
      throw new Error(`useRandomNames: names must be stable between renders`);
    names.forEach((n, i) => {
      if (ref.current[i] !== n) {
        throw new Error(`useRandomNames: names must be stable between renders`);
      }
    });
  }, names);
  return useMemoOnce(() => {
    return names.reduce((acc, key) => {
      acc[key] =
        `name_${Math.random().toString(36).substring(8)}` as RandomName<T>;
      return acc;
    }, {} as RandomKeysData<T>);
  });
}
