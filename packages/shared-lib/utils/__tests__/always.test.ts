import always from "../always.ts";

describe("always", () => {
  it("always returns the same value", () => {
    const fn = always(42);
    expect(fn()).toBe(42);
    expect(fn(1, 2, 3)).toBe(42);
  });
});
