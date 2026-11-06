import { useRef } from "react";

/** Returns a ref that always points to the latest value of the provided value */
export default function useUpdatedRef<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
