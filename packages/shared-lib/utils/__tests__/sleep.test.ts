import sleep from "../sleep.ts";

describe("sleep", () => {
  it("resolves after the given time", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // allow some timing slack
  });
});
