import entries from "../entries.ts";

describe("entries", () => {
  it("returns entries of an object", () => {
    expect(entries({ a: 1, b: 2 })).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});
