import { createSocket } from "node:dgram";
import { networkInterfaces } from "node:os";
import type { Page } from "@playwright/test";
import { expect, pageRecord, test } from "./fixtures.ts";
import {
  WEBRTC,
  composer,
  connectPeers,
  messageText,
  sendMessage,
  startChat,
} from "./helpers.ts";

/**
 * A STUN server that receives requests and never answers, like a network that
 * drops UDP to the STUN servers. Browsers then keep gathering candidates for
 * several seconds. On the machine's own address, so nothing leaves the
 * machine, and not on loopback, which browsers don't gather from.
 */
async function openSilentStunServer() {
  const address = Object.values(networkInterfaces())
    .flat()
    .find((info) => info?.family === "IPv4" && !info.internal)?.address;
  if (!address) throw new Error("This machine has no IPv4 address");
  const socket = createSocket("udp4");
  let requests = 0;
  socket.on("message", () => requests++);
  await new Promise<void>((resolve) => socket.bind(0, address, resolve));
  return {
    iceServers: [{ urls: `stun:${address}:${socket.address().port}` }],
    requests: () => requests,
    close: () => new Promise<void>((resolve) => socket.close(() => resolve())),
  };
}

/**
 * Holds back each candidate the signaling server relays to the page, like a
 * busy server or network. Firefox fails ICE when no remote candidate arrives
 * within 5 seconds of its checks starting
 */
async function delayRelayedCandidates(page: Page, delayMs: number) {
  await page.routeWebSocket(/socket\.io/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.includes('"CANDIDATE"')) {
        setTimeout(() => socket.send(message), delayMs);
      } else {
        socket.send(message);
      }
    });
  });
}

test(
  "connects when the signaling server relays candidates slowly",
  WEBRTC,
  async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    await delayRelayedCandidates(alice, 6_000);
    await delayRelayedCandidates(bob, 6_000);
    await startChat(alice, bob);
  },
);

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

test(
  "connects without waiting for a STUN server that doesn't answer",
  WEBRTC,
  async ({ openPeer, browserName }) => {
    const stun = await openSilentStunServer();
    try {
      const alice = await openPeer({ iceServers: stun.iceServers });
      const bob = await openPeer({ iceServers: stun.iceServers });
      await startChat(alice, bob);

      expect(stun.requests(), "requests to the STUN server").toBeGreaterThan(0);
      // Chromium stops gathering as soon as the peers connect. Firefox keeps
      // waiting for the STUN server for several seconds, and the chat doesn't
      if (browserName === "firefox") {
        for (const page of [alice, bob]) {
          const gathering = await pageRecord(
            page,
            ({ connections: [connection] }) => connection.iceGatheringState,
          );
          expect(gathering, "ICE gathering when the chat opens").toBe(
            "gathering",
          );
        }
      }
      await sendMessage(alice, "Not waiting for STUN");
      await expect(messageText(bob, "Not waiting for STUN")).toBeVisible();
    } finally {
      await stun.close();
    }
  },
);
