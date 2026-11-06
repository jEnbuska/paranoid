function isNotNil<T extends NonNullable<any>>(data: T): data is NonNullable<T> {
  return data != null;
}
export function assertIsNotNil<T extends NonNullable<any>>(
  data: T | undefined,
  message = "Data is nil",
): asserts data is NonNullable<T> {
  if (isNotNil(data)) return;
  throw new Error(message);
}

export function asNotNil<T extends NonNullable<any>>(
  data: T | undefined,
  message = "Data is nil",
): NonNullable<T> {
  assertIsNotNil(data, message);
  return data;
}
