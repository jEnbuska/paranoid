import { prop, propEquals, propNotEquals } from "../prop.ts";

describe("prop", () => {
  it("returns a function that gets a property", () => {
    const getA = prop<{ a: number; b: 2 }, "a">("a");
    expect(getA({ a: 1, b: 2 })).toBe(1);
  });
});
describe("propEquals", () => {
  it("returns a function that checks property equality", () => {
    const isA1 = propEquals("a", 1);
    expect(isA1({ a: 1, b: 2 })).toBe(true);
    expect(isA1({ a: 2, b: 2 })).toBe(false);
  });
});
describe("propNotEquals", () => {
  it("returns a function that checks property inequality", () => {
    const isNotA1 = propNotEquals("a", 1);
    expect(isNotA1({ a: 1, b: 2 })).toBe(false);
    expect(isNotA1({ a: 2, b: 2 })).toBe(true);
  });
});
