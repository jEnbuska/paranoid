export default function curry<Head extends any[], Tail extends any[], R>(
  fn: (...args: [...Head, ...Tail]) => R,
  ...args: Head
) {
  return function curried(...rest: Tail): R {
    return fn(...args, ...rest);
  };
}
