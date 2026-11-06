export default function invoke<T>(callback: () => T) {
  return callback();
}
