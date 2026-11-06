import * as strings from "../strings.ts";

describe("strings utils", () => {
  it("capitalize capitalizes the first letter", () => {
    expect(strings.capitalize("foo")).toBe("Foo");
    expect(strings.capitalize("")).toBe("");
  });
  it("hyphenToSpace replaces hyphens with spaces", () => {
    expect(strings.hyphenToSpace("foo-bar")).toBe("foo bar");
    expect(strings.hyphenToSpace("foo-bar-baz")).toBe("foo bar baz");
  });
});
