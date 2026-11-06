type ObjectEntries<T extends Record<PropertyKey, any>> = {
  [K in keyof T]: [K, T[K]];
}[keyof T];

export default function entries<T>(data: T[]): Array<[number, T]>;
export default function entries<T extends Record<PropertyKey, any>>(
  data: T,
): Array<ObjectEntries<T>>;
export default function entries(data: any): any {
  return Object.entries(data);
}
