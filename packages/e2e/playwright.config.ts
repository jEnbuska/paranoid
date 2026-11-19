import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Not 8181 and 5173, so the tests run next to `pnpm dev` */
const signalingPort = Number(process.env.E2E_SIGNALING_PORT || 8193);
const clientPort = Number(process.env.E2E_CLIENT_PORT || 5193);
/**
 * IPv4, not `localhost`. Without camera or microphone permission, Firefox
 * gathers ICE candidates only on the interface that routes to the server the
 * page came from. For a loopback server it looks up the route to a public
 * address of the same IP version instead. `localhost` resolves to `::1`
 * first, and machines without an IPv6 route, such as GitHub's runners and
 * Docker containers, then get no candidates at all, so peers never connect.
 */
const clientOrigin = `http://127.0.0.1:${clientPort}`;
/** An app that already runs. The tests then start no servers of their own */
const externalApp = process.env.E2E_BASE_URL;
const repositoryRoot = resolve(import.meta.dirname, "../..");
/** Relative to packages/client-app. Not its dist, which keeps the default server address */
const outDir = "../e2e/dist";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // A test that needs a retry to pass is flaky, so no retries hide it
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  // Assertions wait for an outcome, and a slow CI machine shouldn't fail them
  expect: { timeout: 15_000 },
  use: {
    baseURL: externalApp || clientOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: externalApp
    ? []
    : [
        {
          name: "signaling",
          command: "pnpm --filter signaling-server start",
          cwd: repositoryRoot,
          url: `http://localhost:${signalingPort}/healthz`,
          env: { PORT: String(signalingPort), CORS_ORIGINS: clientOrigin },
          reuseExistingServer: false,
          gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
        },
        {
          name: "client",
          // The production build, so the tests cover what is deployed
          command:
            `pnpm --filter client-app exec vite build --outDir ${outDir} --emptyOutDir` +
            ` && pnpm --filter client-app exec vite preview --outDir ${outDir} --host 127.0.0.1 --port ${clientPort} --strictPort`,
          cwd: repositoryRoot,
          url: clientOrigin,
          env: { VITE_SIGNALING_SERVER: `localhost:${signalingPort}` },
          reuseExistingServer: false,
          timeout: 120_000,
          gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
        },
      ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Plain host candidates instead of mDNS names, which depend on
          // multicast working on the machine
          args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
        },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: {
          firefoxUserPrefs: {
            "media.peerconnection.ice.obfuscate_host_addresses": false,
          },
        },
      },
    },
    {
      // WebKit only offers mDNS host candidates and they don't resolve here, so
      // two peers never connect. The rest of the UI still runs in its engine.
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grepInvert: /@webrtc/,
    },
  ],
});
