export default function maxLengthValidator(
  maxLength: number,
  subject = "text",
) {
  return (value: string) =>
    value?.trim().length <= maxLength
      ? undefined
      : `The ${subject} can't be longer than ${maxLength} characters`;
}
