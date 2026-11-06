export type InputValidator = (
  value: string,
) => Promise<string | undefined> | string | undefined;
