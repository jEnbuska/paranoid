export function minLengthValidator(minLength: number, subject = "text") {
  return async (value: string) =>
    value?.trim().length >= minLength
      ? undefined
      : `The ${subject} can't be shorter than ${minLength} characters`;
}
