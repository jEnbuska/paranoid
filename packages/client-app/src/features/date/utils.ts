import { format } from "date-fns";
import { prop } from "shared-lib/utils/prop";

export function toSimpleTime(date: string | number): string {
  return format(new Date(date), "HH:mm");
}

export function toSimpleDate(date: number | string): string {
  try {
    return new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(new Date(date));
  } catch (e) {
    throw new Error(`Failed to format date: ${date}`, { cause: e });
  }
}

const rtf = new Intl.RelativeTimeFormat("en", { style: "long" });
export function formatExpiresInExact(number: number) {
  const minutes = Math.floor(number / 60);
  const seconds = number % 60;
  return [
    minutes &&
      rtf.formatToParts(minutes, "minute").slice(1).map(prop("value")).join(""),
    seconds &&
      rtf.formatToParts(seconds, "second").slice(1).map(prop("value")).join(""),
  ]
    .filter(Boolean)
    .join(" ");
}
