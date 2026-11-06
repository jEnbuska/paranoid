import { joinValidator } from "./utils";
import maxLengthValidator from "./max-length";
import { minLengthValidator } from "./min-length";

const listFormatter = new Intl.ListFormat("en");
function validatePassPhrase(password: string) {
  const errors: string[] = [];
  if (password !== password.trim())
    return "Password cannot have leading or trailing spaces";
  if (password.toUpperCase() === password) errors.push("lowercase letter");
  if (password.toLowerCase() === password) errors.push("uppercase letter");
  if (!/\d/.test(password)) errors.push("number");
  if (!/[^a-zA-Z0-9]/.test(password)) errors.push("special character");
  if (!errors.length) return undefined;
  return `Password must contain at least one ${listFormatter.format(errors)}`;
}

export const passwordValidator = joinValidator(
  minLengthValidator(12, "pass phrase"),
  maxLengthValidator(50, "pass phrase"),
  validatePassPhrase,
);
