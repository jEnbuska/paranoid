import pick from "../pick.ts";

describe("pick", () => {
  it("picks specified keys from object", () => {
    expect(pick(["a", "b"], { a: 1, b: 2, c: 3 })).toEqual({ a: 1, b: 2 });
  });
  it("returns a curried function if only keys are provided", () => {
    const pickAB = pick(["a", "b"]);
    expect(pickAB({ a: 1, b: 2, c: 3 })).toEqual({ a: 1, b: 2 });
  });
});
