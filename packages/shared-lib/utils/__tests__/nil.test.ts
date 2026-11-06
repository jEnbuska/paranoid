import * as nil from "../nil.ts";

describe("nil utils", () => {
  it("assertIsNotNil throws for nil", () => {
    expect(() => nil.assertIsNotNil(undefined)).toThrow();
    expect(() => nil.assertIsNotNil(null)).toThrow();
    expect(() => nil.assertIsNotNil(1)).not.toThrow();
  });
  it("asNotNil returns value or throws", () => {
    expect(nil.asNotNil(2)).toBe(2);
    expect(() => nil.asNotNil(undefined)).toThrow();
  });
});
