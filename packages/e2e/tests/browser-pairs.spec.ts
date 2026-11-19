import type { BrowserName } from "./browsers.ts";
import { expect, test } from "./fixtures.ts";
import { WEBRTC, messageText, sendMessage, startChat } from "./helpers.ts";

/**
 * Every ordered pair of different browsers, the inviter first. Browsers set
 * up WebRTC differently, and each project only runs both people in its own
 * browser.
 */
const pairs: [inviter: BrowserName, joiner: BrowserName][] = [
  ["chromium", "firefox"],
  ["firefox", "chromium"],
  ["chromium", "webkit"],
  ["webkit", "chromium"],
  ["firefox", "webkit"],
  ["webkit", "firefox"],
];

test.describe("two people in different browsers", WEBRTC, () => {
  for (const [inviter, joiner] of pairs) {
    test(`${inviter} invites and ${joiner} joins`, async ({
      openPeer,
      browserName,
    }) => {
      // Once when every project runs
      test.skip(browserName !== inviter, `Runs in the ${inviter} project`);
      const alice = await openPeer({ browser: inviter });
      const bob = await openPeer({ browser: joiner });
      expect(alice.context().browser()?.browserType().name()).toBe(inviter);
      expect(bob.context().browser()?.browserType().name()).toBe(joiner);

      await startChat(alice, bob);

      await sendMessage(alice, "Hello from Alice");
      await expect(messageText(bob, "Hello from Alice")).toBeVisible();
      await sendMessage(bob, "Hello from Bob");
      await expect(messageText(alice, "Hello from Bob")).toBeVisible();
    });
  }
});
