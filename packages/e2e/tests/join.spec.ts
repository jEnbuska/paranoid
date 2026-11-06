import { expect, test } from "./fixtures.ts";
import {
  PASS_PHRASE,
  createInvite,
  displayNameField,
  errorPage,
  inviteDialog,
  openJoinForm,
  passPhraseField,
  submitJoinForm,
} from "./helpers.ts";

test("an unknown invite shows an error", async ({ openPeer }) => {
  const page = await openPeer();
  await page.goto("/join/00000000-0000-4000-8000-000000000000");
  await expect(errorPage(page)).toBeVisible();
});

test("an invite can only be opened once", async ({ openPeer }) => {
  const alice = await openPeer();
  const bob = await openPeer();
  const carol = await openPeer();
  const link = await createInvite(alice);
  await openJoinForm(bob, link);

  await carol.goto(link);

  await expect(errorPage(carol)).toBeVisible();
  await expect(displayNameField(bob)).toBeVisible();
});

test("the inviter sees when an invite has been opened", async ({
  openPeer,
}) => {
  const alice = await openPeer();
  const bob = await openPeer();
  const link = await createInvite(alice);
  await expect(alice.getByText("has been opened")).toBeHidden();
  await openJoinForm(bob, link);
  await expect(alice.getByText("has been opened")).toBeVisible();
});

test("the inviter sees an error when the person joining leaves", async ({
  openPeer,
}) => {
  const alice = await openPeer();
  const bob = await openPeer();
  await openJoinForm(bob, await createInvite(alice));
  await bob.close();
  await expect(errorPage(alice)).toBeVisible();
});

test("the join form requires a name and a pass phrase", async ({
  openPeer,
}) => {
  const alice = await openPeer();
  const bob = await openPeer();
  await openJoinForm(bob, await createInvite(alice));
  const join = bob.getByRole("button", { name: "Join" });

  await join.click();
  await expect(displayNameField(bob)).toBeFocused();

  await displayNameField(bob).fill("Bob");
  await join.click();
  await expect(passPhraseField(bob)).toBeFocused();

  // Nothing was sent, so the inviter is still waiting
  await expect(inviteDialog(alice).getByRole("alert")).toHaveCount(0);
});

test("Clear empties the join form", async ({ openPeer }) => {
  const alice = await openPeer();
  const bob = await openPeer();
  await openJoinForm(bob, await createInvite(alice));
  await displayNameField(bob).fill("Bob");
  await passPhraseField(bob).fill(PASS_PHRASE);

  await bob.getByRole("button", { name: "Clear" }).click();

  await expect(displayNameField(bob)).toHaveValue("");
  await expect(passPhraseField(bob)).toHaveValue("");
});

test("a pass phrase can be shown while joining", async ({ openPeer }) => {
  const alice = await openPeer();
  const bob = await openPeer();
  await openJoinForm(bob, await createInvite(alice));
  await passPhraseField(bob).fill(PASS_PHRASE);
  await expect(passPhraseField(bob)).toHaveAttribute("type", "password");
  await bob.getByRole("button", { name: "Show password" }).click();
  await expect(passPhraseField(bob)).toHaveAttribute("type", "text");
});

test("a wrong pass phrase ends the invite on both sides", async ({
  openPeer,
}) => {
  const alice = await openPeer();
  const bob = await openPeer();
  await openJoinForm(bob, await createInvite(alice));

  await submitJoinForm(bob, { passPhrase: "Wrong-Horse-99" });

  await expect(errorPage(bob)).toBeVisible();
  await expect(errorPage(alice)).toBeVisible();
});

test("shows an error when the signaling server can't be reached", async ({
  openPeer,
}) => {
  const page = await openPeer();
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close());
  await page.route(/socket\.io/, (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "An unexpected error occurred" }),
  ).toBeVisible();
});

for (const { name, value, error } of [
  {
    name: "too short",
    value: "B",
    error: "The display name can't be shorter than 3 characters",
  },
  {
    name: "too long",
    value: "B".repeat(21),
    error: "The display name can't be longer than 20 characters",
  },
]) {
  test(`the join form rejects a ${name} name`, async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    await openJoinForm(bob, await createInvite(alice));
    await submitJoinForm(bob, { name: value });
    await expect(bob.getByText(error)).toBeVisible();
  });
}
