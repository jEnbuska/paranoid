export default function always<T>(data: T) {
  return (..._: any[]) => data;
}
