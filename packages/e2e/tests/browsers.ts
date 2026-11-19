import { devices, type LaunchOptions } from "@playwright/test";

export type BrowserName = "chromium" | "firefox" | "webkit";

/**
 * Each browser's device and launch settings. The projects in
 * `playwright.config.ts` use them, and so does `openPeer` when it launches a
 * browser other than the project's own.
 */
export const browsers = {
  chromium: {
    device: devices["Desktop Chrome"],
    launchOptions: {
      // Plain host candidates instead of mDNS names, which depend on
      // multicast working on the machine
      args: ["--disable-features=WebRtcHideLocalIpsWithMdns"],
    },
  },
  firefox: {
    device: devices["Desktop Firefox"],
    launchOptions: {
      firefoxUserPrefs: {
        "media.peerconnection.ice.obfuscate_host_addresses": false,
      },
    },
  },
  webkit: {
    device: devices["Desktop Safari"],
    launchOptions: {},
  },
} satisfies Record<
  BrowserName,
  { device: (typeof devices)[string]; launchOptions: LaunchOptions }
>;
