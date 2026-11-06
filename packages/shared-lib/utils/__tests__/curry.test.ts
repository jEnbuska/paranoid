import curry from "../curry.ts";

describe("curry", () => {
  it("curries a function with 0 arguments", () => {
    const fn = () => 42;
    const curried = curry(fn);
    expect(curried()).toBe(42);
  });

  it("curries a function with 1 argument and 0 curried", () => {
    const add1 = (a: number) => a + 1;
    const curried = curry(add1);
    expect(curried(2)).toBe(3);
  });

  it("curries a function with 1 argument and 1 curried", () => {
    const add1 = (a: number) => a + 1;
    const curried = curry(add1, 2);
    expect(curried()).toBe(3);
  });

  it("curries a function with 2 arguments and 0 curried", () => {
    const add = (a: number, b: string) => a + b;
    const curried = curry(add);
    expect(curried(1, "2")).toBe("12");
  });

  it("curries a function with 2 arguments and 1 curried", () => {
    const add = (a: number, b: string) => a + b;
    const add5 = curry(add, 5);
    expect(add5("3")).toBe("53");
  });

  it("curries a function with 2 arguments and 2 curried", () => {
    const add = (a: number, b: number) => a + b;
    const curried = curry(add, 1, 2);
    expect(curried()).toBe(3);
  });

  it("curries a function with 3 arguments and 0 curried", () => {
    const add = (a: number, b: number, c: number) => a + b + c;
    const curried = curry(add);
    expect(curried(1, 2, 3)).toBe(6);
  });

  it("curries a function with 3 arguments and 1 curried", () => {
    const add = (a: number, b: number, c: number) => a + b + c;
    const curried = curry(add, 1);
    expect(curried(2, 3)).toBe(6);
  });

  it("curries a function with 3 arguments and 2 curried", () => {
    const add = (a: number, b: number, c: number) => a + b + c;
    const curried = curry(add, 1, 2);
    expect(curried(3)).toBe(6);
  });

  it("curries a function with 3 arguments and 3 curried", () => {
    const sum3 = (a: number, b: number, c: number) => a + b + c;
    const curried = curry(sum3, 1, 2, 3);
    expect(curried()).toBe(6);
  });

  it("curries a function with 4 arguments", () => {
    const sum4 = (a: number, b: number, c: number, d: number) => a + b + c + d;
    const curried = curry(sum4, 1, 2, 3);
    expect(curried(4)).toBe(10);
  });

  it("curries a function with 5 arguments", () => {
    const sum5 = (a: number, b: number, c: number, d: number, e: number) =>
      a + b + c + d + e;
    const curried = curry(sum5, 1, 2, 3, 4);
    expect(curried(5)).toBe(15);
    const curriedAll = curry(sum5, 1, 2, 3, 4, 5);
    expect(curriedAll()).toBe(15);
  });
});
