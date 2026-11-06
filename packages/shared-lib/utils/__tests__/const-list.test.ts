import constList from "../const-list.ts";

describe("constList", () => {
  it("returns an array of its arguments", () => {
    expect(constList(1, 2, 3)).toEqual([1, 2, 3]);
    expect(constList("a", "b")).toEqual(["a", "b"]);
  });
});
