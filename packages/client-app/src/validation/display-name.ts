import { joinValidator } from "./utils";
import maxLengthValidator from "./max-length";
import { minLengthValidator } from "./min-length";

export const validateDisplayName = joinValidator(
  minLengthValidator(3, "display name"),
  maxLengthValidator(20, "display name"),
);
