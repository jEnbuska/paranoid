export function capitalize<T extends string>(str: T): Capitalize<T> {
  return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<T>;
}

type HyphenToSpace<T extends string> = T extends `${infer P1}-${infer P2}`
  ? `${P1} ${HyphenToSpace<P2>}`
  : T;

export function hyphenToSpace<T extends string>(str: T): HyphenToSpace<T> {
  return str.replace(/-/g, " ") as HyphenToSpace<T>;
}
