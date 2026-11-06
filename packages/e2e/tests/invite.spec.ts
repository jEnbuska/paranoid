import type { Page } from "@playwright/test";
import { expect, test, pageRecord } from "./fixtures.ts";
import {
  PASS_PHRASE,
  cancelInvite,
  copyInviteLink,
  createInvite,
  displayNameField,
  errorPage,
  inviteDialog,
  openInviteDialog,
  openJoinForm,
  passwordField,
} from "./helpers.ts";

test.describe("display name", () => {
  test("is required", async ({ openPeer }) => {
    const page = await openPeer();
    await page.goto("/");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(displayNameField(page)).toBeFocused();
    expect(
      await displayNameField(page).evaluate(
        (input: HTMLInputElement) => input.validity.valueMissing,
      ),
    ).toBe(true);
    await expect(inviteDialog(page)).toBeHidden();
  });

  for (const { name, value, error } of [
    {
      name: "can't be too short",
      value: "Al",
      error: "The display name can't be shorter than 3 characters",
    },
    {
      name: "can't be only spaces around too few characters",
      value: "  Al  ",
      error: "The display name can't be shorter than 3 characters",
    },
    {
      name: "can't be too long",
      value: "A".repeat(21),
      error: "The display name can't be longer than 20 characters",
    },
  ]) {
    test(name, async ({ openPeer }) => {
      const page = await openPeer();
      await page.goto("/");
      await displayNameField(page).fill(value);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(page.getByText(error)).toBeVisible();
      await expect(displayNameField(page)).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(inviteDialog(page)).toBeHidden();
    });
  }

  test("carries over to the invite dialog, where it can't be changed", async ({
    openPeer,
  }) => {
    const page = await openPeer();
    await openInviteDialog(page, "Alice");
    const field = displayNameField(inviteDialog(page));
    await expect(field).toHaveValue("Alice");
    await expect(field).toBeDisabled();
  });
});

test.describe("invite password", () => {
  for (const { name, value, error } of [
    {
      name: "too short",
      value: "Aa1!",
      error: "The pass phrase can't be shorter than 12 characters",
    },
    {
      name: "too long",
      value: `Aa1!${"x".repeat(47)}`,
      error: "The pass phrase can't be longer than 50 characters",
    },
    {
      name: "spaces around it",
      value: " Correct-Horse-42 ",
      error: "Password cannot have leading or trailing spaces",
    },
    {
      name: "no lowercase letter",
      value: "CORRECT-HORSE-42",
      error: "Password must contain at least one lowercase letter",
    },
    {
      name: "no uppercase letter",
      value: "correct-horse-42",
      error: "Password must contain at least one uppercase letter",
    },
    {
      name: "no number",
      value: "Correct-Horse-Hi",
      error: "Password must contain at least one number",
    },
    {
      name: "no special character",
      value: "CorrectHorse42x",
      error: "Password must contain at least one special character",
    },
    {
      name: "several things missing",
      value: "correcthorsebattery",
      error:
        "Password must contain at least one uppercase letter, number, and special character",
    },
  ]) {
    test(`is rejected with ${name}`, async ({ openPeer }) => {
      const page = await openPeer();
      await openInviteDialog(page);
      await passwordField(page).fill(value);
      await inviteDialog(page).getByRole("button", { name: "Submit" }).click();
      await expect(inviteDialog(page).getByText(error)).toBeVisible();
      await expect(passwordField(page)).toHaveAttribute("aria-invalid", "true");
      await expect(
        inviteDialog(page).getByRole("button", { name: "Copy invite link" }),
      ).toBeHidden();
    });
  }

  test("is required", async ({ openPeer }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    await inviteDialog(page).getByRole("button", { name: "Submit" }).click();
    await expect(passwordField(page)).toBeFocused();
    await expect(
      inviteDialog(page).getByRole("button", { name: "Copy invite link" }),
    ).toBeHidden();
  });

  test("can be generated, and the result is accepted", async ({ openPeer }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    await inviteDialog(page)
      .getByRole("button", { name: "Generate password" })
      .click();
    await expect(passwordField(page)).not.toHaveValue("");
    await expect(passwordField(page)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await inviteDialog(page).getByRole("button", { name: "Submit" }).click();
    await expect(
      inviteDialog(page).getByRole("button", { name: "Copy invite link" }),
    ).toBeVisible();
  });

  test("can be shown and hidden", async ({ openPeer }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    await passwordField(page).fill(PASS_PHRASE);
    await expect(passwordField(page)).toHaveAttribute("type", "password");

    const dialog = inviteDialog(page);
    await dialog.getByRole("button", { name: "Show password" }).click();
    await expect(passwordField(page)).toHaveAttribute("type", "text");
    await expect(passwordField(page)).toHaveValue(PASS_PHRASE);

    await dialog.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordField(page)).toHaveAttribute("type", "password");
  });
});

test.describe("invite duration", () => {
  test("is chosen with the slider, from 2 to 20 minutes", async ({
    openPeer,
  }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    const dialog = inviteDialog(page);
    const slider = dialog.getByRole("slider", { name: "Invite TTL" });
    await expect(slider).toHaveAttribute("aria-valuetext", "10 minutes");
    await expect(dialog.getByRole("status")).toHaveText("10 minutes");

    await slider.fill("120");
    await expect(dialog.getByRole("status")).toHaveText("2 minutes");
    await expect(slider).toHaveAttribute("aria-valuetext", "2 minutes");
    await slider.fill("1200");
    await expect(dialog.getByRole("status")).toHaveText("20 minutes");

    await slider.fill("180");
    await passwordField(page).fill(PASS_PHRASE);
    await dialog.getByRole("button", { name: "Submit" }).click();
    await expect(
      dialog.getByText("Invite expires within 3 minutes"),
    ).toBeVisible();
  });
});

test.describe("sharing the invite", () => {
  test("copies the link and the password to the clipboard", async ({
    openPeer,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Firefox can't be granted the permission, and only Chromium's headless shell is known to keep the machine's clipboard untouched",
    );
    const page = await openPeer({
      clipboard: "real",
      context: { permissions: ["clipboard-read", "clipboard-write"] },
    });
    await openInviteDialog(page);
    await passwordField(page).fill(PASS_PHRASE);
    const dialog = inviteDialog(page);
    await dialog.getByRole("button", { name: "Submit" }).click();

    await dialog.getByRole("button", { name: "Copy invite link" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Invite secret copied" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toMatch(/\/join\/[0-9a-f-]{36}$/);

    await dialog.getByRole("button", { name: "Copy invite password" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Invite password copied" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(PASS_PHRASE);
  });

  test("copies a link that opens the invite", async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    const link = await createInvite(alice);
    expect(new URL(link).pathname).toMatch(/^\/join\/[0-9a-f-]{36}$/);
    await openJoinForm(bob, link);
    await expect(alice.getByText("has been opened")).toBeVisible();
  });

  test("tells when copying fails", async ({ openPeer }) => {
    const page = await openPeer({ clipboard: "reject" });
    await openInviteDialog(page);
    await passwordField(page).fill(PASS_PHRASE);
    const dialog = inviteDialog(page);
    await dialog.getByRole("button", { name: "Submit" }).click();

    await dialog.getByRole("button", { name: "Copy invite link" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Failed to copy invite secret to clipboard!",
      }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Copy invite password" }).click();
    await expect(
      page.getByRole("status").filter({
        hasText: "Failed to copy invite password to clipboard!",
      }),
    ).toBeVisible();
  });

  test("shares the link, with the pass phrase only if chosen", async ({
    openPeer,
  }) => {
    const page = await openPeer({ webShare: true });
    await openInviteDialog(page);
    await passwordField(page).fill(PASS_PHRASE);
    const dialog = inviteDialog(page);
    await dialog.getByRole("button", { name: "Submit" }).click();
    const link = await copyInviteLink(page);

    const include = dialog.getByRole("checkbox", {
      name: "Include pass phrase with the invite",
    });
    await expect(include).toBeChecked();
    await dialog.getByRole("button", { name: "Share direct link" }).click();
    await expect
      .poll(() => pageRecord(page, (record) => record.shared.at(-1)))
      .toMatchObject({ url: link, text: `Password: ${PASS_PHRASE}` });

    await include.uncheck();
    await dialog.getByRole("button", { name: "Share direct link" }).click();
    await expect
      .poll(() => pageRecord(page, (record) => record.shared.length))
      .toBe(2);
    const shared = await pageRecord(page, (record) => record.shared[1]);
    expect(shared.url).toBe(link);
    expect(JSON.stringify(shared)).not.toContain(PASS_PHRASE);
  });
});

test.describe("closing the invite dialog", () => {
  test("Cancel goes back to the empty form", async ({ openPeer }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    await inviteDialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(inviteDialog(page)).toBeHidden();
    await expect(displayNameField(page)).toHaveValue("");
  });

  test("Escape closes it", async ({ openPeer }) => {
    const page = await openPeer();
    await openInviteDialog(page);
    await page.keyboard.press("Escape");
    await expect(inviteDialog(page)).toBeHidden();
  });

  test("a closed invite can no longer be opened", async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    const link = await createInvite(alice);
    await cancelInvite(alice);
    await bob.goto(link);
    await expect(errorPage(bob)).toBeVisible();
  });

  test("a new invite can be created afterwards", async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    await createInvite(alice);
    await cancelInvite(alice);

    // The form resets just after the dialog closes, which can wipe a quick entry
    await expect(async () => {
      await displayNameField(alice).fill("Alice");
      await alice.getByRole("button", { name: "Create" }).click();
      await expect(inviteDialog(alice)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await passwordField(alice).fill(PASS_PHRASE);
    await inviteDialog(alice).getByRole("button", { name: "Submit" }).click();
    await openJoinForm(bob, await copyInviteLink(alice));
    await expect(alice.getByText("has been opened")).toBeVisible();
  });

  test("tells someone who has the invite open", async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    await openJoinForm(bob, await createInvite(alice));
    await inviteDialog(alice).getByRole("button", { name: "Cancel" }).click();
    await expect(errorPage(bob)).toBeVisible();
  });
});

test.describe("invite expiry", () => {
  /** Creates an invite that expires soon and returns its link */
  async function createShortInvite(page: Page) {
    await openInviteDialog(page);
    const slider = inviteDialog(page).getByRole("slider", {
      name: "Invite TTL",
    });
    // The slider stops at 2 minutes. The server accepts down to 20 seconds, so
    // these tests don't have to wait for 2 minutes of real time.
    await slider.evaluate((input: HTMLInputElement) => {
      input.min = "20";
      input.step = "1";
    });
    await slider.fill("20");
    await passwordField(page).fill(PASS_PHRASE);
    await inviteDialog(page).getByRole("button", { name: "Submit" }).click();
    return copyInviteLink(page);
  }
  const untilExpired = { timeout: 40_000 };

  test("both people see an error when the invite expires", async ({
    openPeer,
  }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    await openJoinForm(bob, await createShortInvite(alice));

    await expect(errorPage(alice)).toBeVisible(untilExpired);
    await expect(errorPage(bob)).toBeVisible();
  });

  test("an expired invite can no longer be opened", async ({ openPeer }) => {
    const alice = await openPeer();
    const bob = await openPeer();
    const link = await createShortInvite(alice);

    await expect(errorPage(alice)).toBeVisible(untilExpired);

    await bob.goto(link);
    await expect(errorPage(bob)).toBeVisible();
  });
});
