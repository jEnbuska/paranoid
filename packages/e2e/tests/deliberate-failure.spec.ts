// Test PR for #52: fails on purpose in Firefox and WebKit to show that their
// e2e checks block a merge into main. Never merge.
import { expect, test } from "@playwright/test";

test("fails on purpose outside Chromium", ({ browserName }) => {
  expect(browserName).toBe("chromium");
});
