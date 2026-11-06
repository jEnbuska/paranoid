export default function clamp(args: {
  value: number;
  min: number;
  max: number;
}) {
  const { min, max } = args;

  const value = Math.min(Math.max(args.value, min), max);
  if (Number.isNaN(value)) {
    throw new Error("Value is NaN");
  }
  return value;
}
