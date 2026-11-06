import memoize from "../memoize.ts";

describe("memoize", () => {
  it("caches function results", () => {
    const fn = vi.fn((x) => x * 2);
    const memoized = memoize(fn);
    expect(memoized(2)).toBe(4);
    expect(memoized(2)).toBe(4);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("caches by arguments", () => {
    const fn = vi.fn((x, y) => x + y);
    const memoized = memoize(fn);
    expect(memoized(1, 2)).toBe(3);
    expect(memoized(1, 2)).toBe(3);
    expect(memoized(2, 3)).toBe(5);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
