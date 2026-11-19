import { expect, test } from "./fixtures.ts";
import {
  WEBRTC,
  createInvite,
  errorPage,
  openInviteDialog,
  passwordField,
  inviteDialog,
  PASS_PHRASE,
  sendMessage,
  messageText,
  startChat,
} from "./helpers.ts";

const LIMIT = { MAX_INVITES: "1" };

test("a second invite is refused while the only one is still open", async ({
  openPeer,
  startSignalingServer,
}) => {
  const server = await startSignalingServer(LIMIT);
  const alice = await openPeer();
  const carol = await openPeer();
  await server.routePage(alice);
  await server.routePage(carol);

  await createInvite(alice);
  await openInviteDialog(carol, "Carol");
  await passwordField(carol).fill(PASS_PHRASE);
  await inviteDialog(carol).getByRole("button", { name: "Submit" }).click();

  await expect(errorPage(carol)).toBeVisible();
  // Alice's invite is still open, so the server keeps running
  await expect(inviteDialog(alice)).toBeVisible();
  expect(await Promise.race([server.exited, "running"])).toBe("running");
});

test(
  "the server exits with code 0 once the last invite connects, and the chat keeps working",
  WEBRTC,
  async ({ openPeer, startSignalingServer }) => {
    const server = await startSignalingServer(LIMIT);
    const alice = await openPeer();
    const bob = await openPeer();
    await server.routePage(alice);
    await server.routePage(bob);

    await startChat(alice, bob);

    expect(await server.exited).toBe(0);
    await sendMessage(alice, "Still here");
    await expect(messageText(bob, "Still here")).toBeVisible();
    await sendMessage(bob, "Me too");
    await expect(messageText(alice, "Me too")).toBeVisible();
  },
);
