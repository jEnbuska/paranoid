import type { Page, WebSocketRoute } from "@playwright/test";
import { expect, pageRecord, type PeerOptions } from "./fixtures.ts";

export const PASS_PHRASE = "Correct-Horse-42";
export const CREATE_DIALOG = "Create Invite";

/** Tag of tests that need two peers to connect over WebRTC */
export const WEBRTC = { tag: "@webrtc" };

export const displayNameField = (scope: Page | ReturnType<Page["getByRole"]>) =>
  scope.getByRole("textbox", { name: "Your display name" });

export const inviteDialog = (page: Page) =>
  page.getByRole("dialog", { name: CREATE_DIALOG });

/** Password inputs have no ARIA role. Anchored to not match "Show password" */
export const passwordField = (page: Page) =>
  inviteDialog(page).getByLabel(/^Password/);

export const passPhraseField = (page: Page) => page.getByLabel(/^Pass phrase/);

export const errorPage = (page: Page) =>
  page.getByRole("alert").filter({ hasText: "An unexpected error occurred" });

export const composer = (page: Page) =>
  page.getByRole("textbox", { name: "Message" });

/** Opens the app and gets to the invite dialog */
export async function openInviteDialog(page: Page, name = "Alice") {
  await page.goto("/");
  await displayNameField(page).fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(inviteDialog(page)).toBeVisible();
}

/** Creates an invite and returns its link, copied the way a person would */
export async function createInvite(
  page: Page,
  { name = "Alice", passPhrase = PASS_PHRASE } = {},
) {
  await openInviteDialog(page, name);
  await passwordField(page).fill(passPhrase);
  await inviteDialog(page).getByRole("button", { name: "Submit" }).click();
  return copyInviteLink(page);
}

export async function copyInviteLink(page: Page) {
  await inviteDialog(page)
    .getByRole("button", { name: "Copy invite link" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invite secret copied" }),
  ).toBeVisible();
  return pageRecord(page, (record) => record.clipboard.at(-1)!);
}

export async function cancelInvite(page: Page) {
  await inviteDialog(page).getByRole("button", { name: "Cancel" }).click();
  await expect(inviteDialog(page)).toBeHidden();
}

/** Opens an invite and waits for its form */
export async function openJoinForm(page: Page, link: string) {
  await page.goto(link);
  await expect(
    page.getByRole("group", { name: "Join an existing invite" }),
  ).toBeVisible();
  await expect(displayNameField(page)).toBeVisible();
}

export async function submitJoinForm(
  page: Page,
  { name = "Bob", passPhrase = PASS_PHRASE } = {},
) {
  await displayNameField(page).fill(name);
  await passPhraseField(page).fill(passPhrase);
  await page.getByRole("button", { name: "Join" }).click();
}

/** Waits until the page is in a chat with `peerName` */
export async function expectInChat(page: Page, peerName: string) {
  await expect(page).toHaveURL(/\/chat$/);
  await expect(
    page.getByRole("heading", { level: 1, name: peerName }),
  ).toBeVisible();
  await expect(composer(page)).toBeEnabled();
}

type OpenPeer = (options?: PeerOptions) => Promise<Page>;

/** Two people who have gone through the whole invite flow and are in a chat */
export async function connectPeers(openPeer: OpenPeer, options?: PeerOptions) {
  const alice = await openPeer(options);
  const bob = await openPeer(options);
  await startChat(alice, bob);
  return { alice, bob };
}

export async function startChat(alice: Page, bob: Page) {
  const link = await createInvite(alice);
  await openJoinForm(bob, link);
  await submitJoinForm(bob);
  await expectInChat(alice, "Bob");
  await expectInChat(bob, "Alice");
}

/**
 * Lets the page reach the signaling server until the returned function is
 * called. The browser itself stays online.
 */
export async function controlSignaling(page: Page) {
  let cut = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/socket\.io/, (socket) => {
    if (cut) return socket.close();
    socket.connectToServer();
    sockets.push(socket);
  });
  await page.route(/socket\.io/, (route) =>
    cut ? route.abort() : route.continue(),
  );
  return async () => {
    cut = true;
    await Promise.all(sockets.map((socket) => socket.close()));
  };
}

/** The text of a message, on the page of either person */
export const messageText = (page: Page, text: string) =>
  page.getByRole("paragraph").filter({ hasText: text });

/** The innermost list item is the message: the day groups are list items too */
export const messageItem = (page: Page, text: string) =>
  page.getByRole("listitem").filter({ hasText: text }).last();

/** Sends a message and waits for the composer to be ready for the next one */
export async function sendMessage(page: Page, text: string) {
  await composer(page).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(messageText(page, text)).toBeVisible();
  await expect(composer(page)).toHaveValue("");
  await expect(composer(page)).toBeEditable();
  await expect(composer(page)).toBeFocused();
}
