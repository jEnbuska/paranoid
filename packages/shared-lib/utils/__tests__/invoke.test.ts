import invoke from "../invoke.ts";

describe("invoke", () => {
  it("calls the callback and returns its value", () => {
    expect(invoke(() => 5)).toBe(5);
  });
});
