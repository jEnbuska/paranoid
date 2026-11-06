import clamp from "../clamp.ts";

describe("clamp", () => {
  it("returns the value if within range", () => {
    expect(clamp({ value: 5, min: 1, max: 10 })).toBe(5);
  });
  it("returns min if value is less than min", () => {
    expect(clamp({ value: -1, min: 0, max: 10 })).toBe(0);
  });
  it("returns max if value is greater than max", () => {
    expect(clamp({ value: 20, min: 0, max: 10 })).toBe(10);
  });
  it("throws if value is NaN", () => {
    expect(() => clamp({ value: NaN, min: 0, max: 10 })).toThrow(
      "Value is NaN",
    );
  });
});
