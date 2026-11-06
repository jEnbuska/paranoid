import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import {
  PASS_PHRASE,
  WEBRTC,
  createInvite,
  expectInChat,
  messageText,
  openJoinForm,
  sendMessage,
  submitJoinForm,
} from "./helpers.ts";

// With a space, so that random base64 ciphertext can't contain them by chance
const ALICE = "Alice Nonesuch";
const BOB = "Bob Nonesuch";

/** Collects everything the page sends to and receives from the signaling server */
function recordSignaling(page: Page) {
  const traffic: string[] = [];
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => traffic.push(String(payload)));
    socket.on("framereceived", ({ payload }) => traffic.push(String(payload)));
  });
  page.on("request", (request) => {
    if (!request.url().includes("/socket.io/")) return;
    traffic.push(request.postData() ?? "");
  });
  page.on("response", async (response) => {
    if (!response.url().includes("/socket.io/")) return;
    traffic.push(await response.text().catch(() => ""));
  });
  return traffic;
}

// FIXME: Peers can get stuck connecting. Sometimes fails with the inviter left
// on the start page.
test.fixme(
  "the signaling server only sees ciphertext",
  WEBRTC,
  async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    const traffic = [...[alice, bob].map(recordSignaling)];

    const link = await createInvite(alice, { name: ALICE });
    await openJoinForm(bob, link);
    await submitJoinForm(bob, { name: BOB });
    await expectInChat(alice, BOB);
    await expectInChat(bob, ALICE);
    await sendMessage(alice, "Top secret from Alice");
    await expect(messageText(bob, "Top secret from Alice")).toBeVisible();
    await sendMessage(bob, "Top secret from Bob");
    await expect(messageText(alice, "Top secret from Bob")).toBeVisible();

    const everything = traffic.flat().join("\n");
    // The handshake did go through the server
    expect(everything).toContain('"DESCRIPTION"');
    expect(everything).toContain('"CANDIDATE"');

    for (const secret of [
      PASS_PHRASE,
      "Top secret",
      ALICE,
      BOB,
      // Plain SDP and ICE candidates would reveal the peers' addresses
      "v=0",
      "a=candidate",
      "typ host",
    ]) {
      expect(everything, `signaling traffic has "${secret}"`).not.toContain(
        secret,
      );
    }
  },
);
