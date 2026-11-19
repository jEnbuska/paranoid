import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import type { Page } from "@playwright/test";

const serverDirectory = resolve(import.meta.dirname, "../../signaling-server");

export type SignalingServer = {
  port: number;
  /** Resolves with the exit code, or null if a signal ended it */
  exited: Promise<number | null>;
  /** Sends this page's socket.io traffic here instead of the shared server */
  use(page: Page): Promise<void>;
  /** Ends the process if it still runs */
  stop(): Promise<void>;
};

/**
 * Starts a signaling server process of its own, for a test that changes its
 * settings or waits for it to exit, which the shared one from `webServer`
 * must not do. `PORT=0` lets the OS pick a free port, so parallel tests never
 * share one, and the server logs the port it got.
 */
export async function startSignalingServer(options: {
  clientOrigin: string;
  env?: Record<string, string>;
}): Promise<SignalingServer> {
  const child = spawn(process.execPath, ["src/server.ts"], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      ...options.env,
      PORT: "0",
      CORS_ORIGINS: options.clientOrigin,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(child, "exit").then(([code]) => code as number | null);
  const port = await readPort(child, exited);
  return {
    port,
    exited,
    use: (page) => routeSignaling(page, port),
    async stop() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      await exited;
    },
  };
}

async function readPort(
  child: ChildProcess,
  exited: Promise<number | null>,
): Promise<number> {
  let stderr = "";
  child.stderr!.on("data", (chunk) => (stderr += chunk));
  const lines = createInterface({ input: child.stdout! });
  const listening = new Promise<number>((resolve) => {
    lines.on("line", (line) => {
      const port = /listening on port (\d+)/.exec(line)?.[1];
      if (port) resolve(Number(port));
    });
  });
  const failed = exited.then((code) => {
    throw new Error(`The signaling server exited with ${code}: ${stderr}`);
  });
  return Promise.race([listening, failed]);
}

/**
 * The client's server address is fixed when it's built, so the page's
 * requests to it go to `port` instead. Only HTTP long-polling: WebSocket
 * upgrades are refused, and socket.io keeps polling, which works the same for
 * what these tests check.
 */
async function routeSignaling(page: Page, port: number) {
  await page.routeWebSocket(/\/socket\.io\//, (socket) => socket.close());
  await page.route(/\/socket\.io\//, (route) => {
    const url = new URL(route.request().url());
    url.port = String(port);
    return route.continue({ url: url.href });
  });
}
