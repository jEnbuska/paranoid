/**
 * Reads VITE_ICE_SERVERS. vite.config.ts runs this as well, so an invalid value
 * fails `vite build` and `vite dev` instead of breaking connections later. That
 * also means this file can't use the `~` alias or DOM types.
 */

/** RTCIceServer without credentials: this variable is built into the client,
 * so anything in it is visible to anyone using the app */
type IceServer = { urls: string | string[] };

export const defaultIceServers: IceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const stunUrl =
  /^stuns?:(?:\[[0-9a-fA-F:.]+\]|[^\s/?#@:[\]]+)(?::(?<port>\d{1,5}))?$/;

// Errors name the position of a problem and never quote the value, so a
// credential put here by mistake doesn't end up in a build log.
function invalid(problem: string) {
  return new Error(
    `VITE_ICE_SERVERS ${problem}. Expected a JSON array of STUN servers, for example [{"urls":"stun:stun.example.com:3478"}].`,
  );
}

function isStunUrl(url: unknown) {
  if (typeof url !== "string") return false;
  const match = stunUrl.exec(url);
  return match !== null && Number(match.groups?.port ?? 0) <= 65535;
}

function validateServer(server: unknown, position: string) {
  if (typeof server !== "object" || server === null || Array.isArray(server)) {
    throw invalid(`has something other than an object at ${position}`);
  }
  if (Object.keys(server).some((key) => key !== "urls")) {
    throw invalid(
      `has a key other than "urls" at ${position}. Credentials must not be put here, because anyone using the app could read them`,
    );
  }
  const { urls } = server as { urls?: unknown };
  const list = Array.isArray(urls) ? urls : [urls];
  if (list.length === 0 || !list.every(isStunUrl)) {
    throw invalid(
      `needs urls with only STUN URLs at ${position}. TURN URLs need credentials, which must not be put here`,
    );
  }
}

/** The configured ICE servers, or the default ones when the value is unset or
 * empty. Throws on anything else that isn't a valid list. */
export function parseIceServers(value: string | undefined): IceServer[] {
  if (!value?.trim()) return defaultIceServers;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalid("isn't valid JSON");
  }
  if (!Array.isArray(parsed)) throw invalid("isn't an array");
  parsed.forEach((server, i) => validateServer(server, `[${i}]`));
  return parsed;
}
