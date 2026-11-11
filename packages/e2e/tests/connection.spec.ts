import { expect, test } from "./fixtures.ts";
import {
  WEBRTC,
  composer,
  connectPeers,
  messageText,
  sendMessage,
  startChat,
} from "./helpers.ts";

// FIXME: Peers can get stuck connecting. Sometimes fails with the inviter left
// on the start page.
test.fixme();

test(
  "someone on a slower device than the joiner can invite",
  WEBRTC,
  async ({ openPeer }) => {
    const alice = await openPeer({ slowKeyDerivationMs: 1000 });
    const bob = await openPeer();
    await startChat(alice, bob);
  },
);

test(
  "someone on a slower device than the inviter can join",
  WEBRTC,
  async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer({ slowKeyDerivationMs: 1000 });
    await startChat(alice, bob);
  },
);

// Messages go directly to the other person, so the browser's online state
// doesn't matter
test(
  "messages can be sent while the browser reports being offline",
  WEBRTC,
  async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await alice.context().setOffline(true);
    await sendMessage(alice, "Still here");
    await expect(messageText(bob, "Still here")).toBeVisible();
    await expect(composer(alice)).toBeEnabled();
  },
);
