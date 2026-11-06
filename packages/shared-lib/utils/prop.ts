export const prop =
  <T extends Record<PropertyKey, any> | any[], K extends keyof T>(key: K) =>
  (target: T) =>
    target[key];

export function propEquals<T extends Record<any, any>, K extends keyof T>(
  key: K,
  value: T[K],
) {
  return (obj: T) => obj[key] === value;
}

export function propNotEquals<T extends Record<any, any>, K extends keyof T>(
  key: K,
  value: T[K],
) {
  return (obj: T) => obj[key] !== value;
}
