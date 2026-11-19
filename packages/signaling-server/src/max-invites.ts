/**
 * Reads `MAX_INVITES`: how many invites the server creates before it exits.
 * Unset or empty means no limit. Throws on anything but a whole number of at
 * least 1
 */
export function parseMaxInvites(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const max = Number(value);
  if (!/^[0-9]+$/.test(value) || !Number.isSafeInteger(max) || max < 1) {
    throw new Error(
      `Invalid MAX_INVITES: ${value}. Expected a whole number of at least 1`,
    );
  }
  return max;
}
