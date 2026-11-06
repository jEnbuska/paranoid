import { InputValidator } from "./types";

export function joinValidator(...args: Array<InputValidator>) {
  return async (value: string): Promise<string | undefined> => {
    if (!value) return;
    for (const arg of args) {
      const error = await arg(value);
      if (error) {
        return error;
      }
    }
  };
}
