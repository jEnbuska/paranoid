// Test PR for #52: fails on purpose to show that a failing e2e check blocks
// the merge. Never merge.
import { expect, test } from "@playwright/test";

test("fails on purpose", () => {
  expect(1).toBe(2);
});
