import { expect, test, pageRecord } from "./fixtures.ts";
import {
  WEBRTC,
  composer,
  connectPeers,
  controlSignaling,
  createInvite,
  displayNameField,
  expectInChat,
  messageItem,
  messageText,
  openJoinForm,
  sendMessage,
  startChat,
  submitJoinForm,
} from "./helpers.ts";

test.describe("two people chatting", WEBRTC, () => {
  // FIXME: Peers can get stuck connecting. Sometimes fails with the inviter left
  // on the start page.
  test.fixme();

  test("connect through an invite and exchange messages both ways", async ({
    openPeer,
  }) => {
    const alice = await openPeer();
    const bob = await openPeer();

    // Creates the invite, joins it, and waits for each side to see the other's name
    await startChat(alice, bob);
    await expect(alice.getByText("No messages yet")).toBeVisible();
    await expect(bob.getByText("No messages yet")).toBeVisible();

    await sendMessage(alice, "Hello from Alice");
    await expect(messageText(bob, "Hello from Alice")).toBeVisible();
    await expect(messageItem(bob, "Hello from Alice")).toContainText("Alice");

    await sendMessage(bob, "Hello from Bob");
    await expect(messageText(alice, "Hello from Bob")).toBeVisible();
    await expect(messageItem(alice, "Hello from Bob")).toContainText("Bob");

    // Both have the conversation in the same order
    for (const page of [alice, bob]) {
      await expect(page.getByRole("paragraph")).toHaveText([
        "Hello from Alice",
        "Hello from Bob",
      ]);
    }
  });

  test("keep the order of quick messages", async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer);
    const texts = ["one", "two", "three", "four", "five"];
    for (const text of texts) await sendMessage(alice, text);
    await expect(bob.getByRole("paragraph")).toHaveText(texts);
  });

  test("Enter sends and Shift+Enter starts a new line", async ({
    openPeer,
  }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await composer(alice).fill("first line");
    await composer(alice).press("Shift+Enter");
    await composer(alice).pressSequentially("second line");
    await expect(composer(alice)).toHaveValue("first line\nsecond line");
    await composer(alice).press("Enter");
    await expect(composer(alice)).toHaveValue("");
    await expect(bob.getByRole("paragraph")).toHaveText(
      /first line\s+second line/,
    );
  });

  test("Enter starts a new line on a touch device", async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer, {
      context: { hasTouch: true },
    });
    await composer(alice).fill("first line");
    await composer(alice).press("Enter");
    await expect(composer(alice)).toHaveValue("first line\n");
    await alice.getByRole("button", { name: "Send" }).click();
    await expect(messageText(bob, "first line")).toBeVisible();
  });

  test("can't send an empty message", async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer);
    const send = alice.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();

    await composer(alice).fill("   ");
    await send.click();
    await composer(alice).press("Enter");
    await sendMessage(alice, "Only this one");
    await expect(bob.getByRole("paragraph")).toHaveText(["Only this one"]);
  });

  test("see markup in a message as plain text", async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer);
    const markup = `<img src=x onerror="document.title='hacked'"><b>bold</b>`;
    await sendMessage(alice, markup);
    await expect(bob.getByRole("paragraph")).toHaveText([markup]);
    await expect(bob.getByRole("paragraph").locator("img, b")).toHaveCount(0);
    expect(await bob.title()).not.toBe("hacked");
  });

  test("keep chatting when the signaling server is out of reach", async ({
    openPeer,
  }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    const cutAlice = await controlSignaling(alice);
    const cutBob = await controlSignaling(bob);
    await startChat(alice, bob);

    await cutAlice();
    await cutBob();

    await sendMessage(alice, "Still here");
    await expect(messageText(bob, "Still here")).toBeVisible();
    await sendMessage(bob, "Me too");
    await expect(messageText(alice, "Me too")).toBeVisible();
  });

  test("the other person sees when someone exits the room", async ({
    openPeer,
  }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await bob.getByRole("button", { name: "Exit room" }).click();

    await expect(displayNameField(bob)).toBeVisible();
    await expect(bob).toHaveURL(/\/$/);
    await expect(
      alice.getByRole("alert").filter({ hasText: "Connection to peer lost" }),
    ).toBeVisible();
    await expect(composer(alice)).toHaveCount(0);
  });

  test("the other person sees when someone closes the page", async ({
    openPeer,
  }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await bob.close({ runBeforeUnload: true });
    await expect(
      alice.getByRole("alert").filter({ hasText: "Connection to peer lost" }),
    ).toBeVisible();
  });

  test("reloading leaves the chat, as nothing is stored", async ({
    openPeer,
  }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await sendMessage(alice, "Gone after a reload");
    await expect(messageText(bob, "Gone after a reload")).toBeVisible();

    await bob.reload();

    await expect(displayNameField(bob)).toBeVisible();
    await expect(bob).toHaveURL(/\/$/);
    await expect(bob.getByText("Gone after a reload")).toHaveCount(0);
    await expect(
      alice.getByRole("alert").filter({ hasText: "Connection to peer lost" }),
    ).toBeVisible();
  });

  test("can start a new chat after leaving one", async ({ openPeer }) => {
    const { alice, bob } = await connectPeers(openPeer);
    await bob.getByRole("button", { name: "Exit room" }).click();
    await expect(
      alice.getByRole("alert").filter({ hasText: "Connection to peer lost" }),
    ).toBeVisible();
    await alice.getByRole("button", { name: "Exit room" }).click();
    await expect(displayNameField(alice)).toBeVisible();

    const link = await createInvite(alice, { name: "Alice again" });
    await openJoinForm(bob, link);
    await submitJoinForm(bob, { name: "Bob again" });
    await expectInChat(alice, "Bob again");
    await expectInChat(bob, "Alice again");
    await sendMessage(bob, "Round two");
    await expect(alice.getByRole("paragraph")).toHaveText(["Round two"]);
  });

  test("connect directly, with no STUN or TURN server configured", async ({
    openPeer,
  }) => {
    const { alice, bob } = await connectPeers(openPeer);
    for (const page of [alice, bob]) {
      const { iceServers, candidateTypes } = await pageRecord(
        page,
        async ({ connections: [connection] }) => {
          const candidateTypes: string[] = [];
          (await connection.getStats()).forEach((stat) => {
            if (stat.type === "local-candidate") {
              candidateTypes.push(stat.candidateType);
            }
          });
          return {
            iceServers: connection.getConfiguration().iceServers,
            candidateTypes,
          };
        },
      );
      expect(iceServers).toEqual([]);
      expect(candidateTypes.length).toBeGreaterThan(0);
      expect(new Set(candidateTypes)).toEqual(new Set(["host"]));
    }
  });
});

test("the chat page without a chat leads to the start page", async ({
  openPeer,
}) => {
  const page = await openPeer();
  await page.goto("/chat");
  await expect(displayNameField(page)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
