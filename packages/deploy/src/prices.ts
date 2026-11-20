// Reads a provider's price file into what worstCaseCost needs, for one
// region and server type. The file is the provider's own
// (deploy/<provider>/prices.json), with the date its prices were checked:
//
//   {
//     "checked": "2026-11-20",
//     "wholeHours": true,             optional, default true
//     "cleanupDelayMinutes": 60,      optional, default 0
//     "regions": {
//       "<region>": {
//         "name": "Stockholm",        optional
//         "servers": { "<server type>": <USD an hour> },
//         "serverBilledWhileStopped": true,   optional, default true
//         "items": [                  optional: what else is billed
//           { "name": "public IPv4 address", "usdPerHour": 0.005 },
//           { "name": "disk", "usdPerMonth": 2.4 },
//           { "name": "disk", "usdPerGibHour": 0.00006, "gib": 10 },
//           { "name": "setup", "usdPerDeployment": 0.01 }
//         ],
//         "egress": { "usdPerGb": 0.09 }   or { "usdPerGib": 0.085 }
//       }
//     }
//   }
//
// Each item has exactly one price. An item is billed while the server is
// stopped too, unless it has "billedWhileStopped": false. A month is 730
// hours. Anything missing, misspelled or negative is an error, so a price
// can't be left out by mistake.

/** Hours in a month, as the providers bill monthly prices by the hour */
const HOURS_PER_MONTH = 730;
const BYTES_PER_GIB = 2 ** 30;

export type DeploymentPrices = {
  /** The date the prices were checked */
  checked: string;
  /** The region's name, or its code */
  regionName: string;
  /** Each hourly item, the server first, in USD an hour */
  lines: {
    name: string;
    runningUsdPerHour: number;
    stoppedUsdPerHour: number;
  }[];
  hourlyUsd: number;
  stoppedHourlyUsd: number;
  fixedUsd: Record<string, number>;
  egressUsdPerGb: number;
  wholeHours: boolean;
  cleanupDelayHours: number;
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(where: string, problem: string): never {
  throw new Error(`Price file, ${where}: ${problem}`);
}

function price(where: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(where, `must be a number of at least 0, not ${JSON.stringify(value)}`);
  }
  return value;
}

function onlyKeys(where: string, object: Json, allowed: string[]) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      fail(where, `unknown key "${key}"`);
    }
  }
}

function itemPrices(where: string, item: Json) {
  const kinds = [
    "usdPerHour",
    "usdPerMonth",
    "usdPerGibHour",
    "usdPerDeployment",
  ];
  const given = kinds.filter((kind) => kind in item);
  if (given.length !== 1) {
    fail(where, `needs exactly one of ${kinds.join(", ")}`);
  }
  const [kind] = given;
  if (kind === "usdPerGibHour") {
    return {
      hourly:
        price(`${where}.usdPerGibHour`, item.usdPerGibHour) *
        price(`${where}.gib`, item.gib),
    };
  }
  if ("gib" in item) {
    fail(where, `"gib" goes only with "usdPerGibHour"`);
  }
  if (kind === "usdPerMonth") {
    return {
      hourly: price(`${where}.usdPerMonth`, item.usdPerMonth) / HOURS_PER_MONTH,
    };
  }
  if (kind === "usdPerDeployment") {
    return { fixed: price(`${where}.usdPerDeployment`, item.usdPerDeployment) };
  }
  return { hourly: price(`${where}.usdPerHour`, item.usdPerHour) };
}

export default function deploymentPrices(
  file: unknown,
  region: string,
  server: string,
): DeploymentPrices {
  if (!isObject(file)) {
    fail("top level", "must be an object");
  }
  onlyKeys("top level", file, [
    "checked",
    "wholeHours",
    "cleanupDelayMinutes",
    "regions",
    "about",
    "sources",
    "currency",
  ]);
  if (
    typeof file.checked !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(file.checked)
  ) {
    fail("checked", "must be the date the prices were checked, as YYYY-MM-DD");
  }
  if (file.currency !== undefined && file.currency !== "USD") {
    fail("currency", "must be USD");
  }
  if (file.wholeHours !== undefined && typeof file.wholeHours !== "boolean") {
    fail("wholeHours", "must be true or false");
  }
  const cleanupDelayMinutes =
    file.cleanupDelayMinutes === undefined
      ? 0
      : price("cleanupDelayMinutes", file.cleanupDelayMinutes);
  if (!isObject(file.regions)) {
    fail("regions", "must be an object");
  }
  const prices = file.regions[region];
  if (!isObject(prices)) {
    fail(
      "regions",
      `has no prices for ${region}. It has ${Object.keys(file.regions).join(", ")}.`,
    );
  }
  const where = `regions.${region}`;
  onlyKeys(where, prices, [
    "name",
    "servers",
    "serverBilledWhileStopped",
    "items",
    "egress",
  ]);
  if (!isObject(prices.servers)) {
    fail(`${where}.servers`, "must be an object");
  }
  if (!(server in prices.servers)) {
    fail(
      `${where}.servers`,
      `has no price for ${server}. It has ${Object.keys(prices.servers).join(", ")}.`,
    );
  }
  const serverUsd = price(`${where}.servers.${server}`, prices.servers[server]);
  if (
    prices.serverBilledWhileStopped !== undefined &&
    typeof prices.serverBilledWhileStopped !== "boolean"
  ) {
    fail(`${where}.serverBilledWhileStopped`, "must be true or false");
  }

  const lines = [
    {
      name: server,
      runningUsdPerHour: serverUsd,
      stoppedUsdPerHour:
        prices.serverBilledWhileStopped === false ? 0 : serverUsd,
    },
  ];
  const fixedUsd: Record<string, number> = {};
  const items = prices.items ?? [];
  if (!Array.isArray(items)) {
    fail(`${where}.items`, "must be a list");
  }
  items.forEach((item: unknown, index) => {
    const at = `${where}.items[${index}]`;
    if (!isObject(item) || typeof item.name !== "string" || item.name === "") {
      fail(at, "must be an object with a name");
    }
    onlyKeys(at, item, [
      "name",
      "usdPerHour",
      "usdPerMonth",
      "usdPerGibHour",
      "gib",
      "usdPerDeployment",
      "billedWhileStopped",
    ]);
    if (
      item.billedWhileStopped !== undefined &&
      typeof item.billedWhileStopped !== "boolean"
    ) {
      fail(`${at}.billedWhileStopped`, "must be true or false");
    }
    const { hourly, fixed } = itemPrices(at, item);
    if (fixed !== undefined) {
      fixedUsd[item.name] = (fixedUsd[item.name] ?? 0) + fixed;
    } else {
      lines.push({
        name: item.name,
        runningUsdPerHour: hourly,
        stoppedUsdPerHour: item.billedWhileStopped === false ? 0 : hourly,
      });
    }
  });

  const egress = prices.egress;
  if (!isObject(egress)) {
    fail(
      `${where}.egress`,
      'must be { "usdPerGb": <price> } or { "usdPerGib": <price> }',
    );
  }
  onlyKeys(`${where}.egress`, egress, ["usdPerGb", "usdPerGib"]);
  if ("usdPerGb" in egress === "usdPerGib" in egress) {
    fail(`${where}.egress`, 'needs exactly one of "usdPerGb" and "usdPerGib"');
  }
  const egressUsdPerGb =
    "usdPerGb" in egress
      ? price(`${where}.egress.usdPerGb`, egress.usdPerGb)
      : (price(`${where}.egress.usdPerGib`, egress.usdPerGib) * 1e9) /
        BYTES_PER_GIB;

  const sum = (key: "runningUsdPerHour" | "stoppedUsdPerHour") =>
    lines.reduce((total, line) => total + line[key], 0);
  return {
    checked: file.checked,
    regionName: typeof prices.name === "string" ? prices.name : region,
    lines,
    hourlyUsd: sum("runningUsdPerHour"),
    stoppedHourlyUsd: sum("stoppedUsdPerHour"),
    fixedUsd,
    egressUsdPerGb,
    wholeHours: file.wholeHours ?? true,
    cleanupDelayHours: cleanupDelayMinutes / 60,
  };
}
