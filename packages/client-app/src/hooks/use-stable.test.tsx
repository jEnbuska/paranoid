// @vitest-environment jsdom
import { useEffect } from "react";
import { cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useStable from "./use-stable.ts";

afterEach(cleanup);

describe("useStable", () => {
  test("keeps the same function across renders", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useStable(() => value),
      { initialProps: { value: 1 } },
    );
    const first = result.current;
    rerender({ value: 2 });
    rerender({ value: 3 });
    expect(result.current).toBe(first);
  });

  test("calls the latest callback with its arguments", () => {
    const { result, rerender } = renderHook(
      ({ offset }) => useStable((value: number) => value + offset),
      { initialProps: { offset: 1 } },
    );
    const stable = result.current;
    expect(stable(10)).toBe(11);
    rerender({ offset: 2 });
    expect(stable(10)).toBe(12);
  });

  test("gives a child's effect the callback of the same render", () => {
    const seen = vi.fn();
    function Child({ report }: { report: () => void }) {
      useEffect(() => report());
      return null;
    }
    function Parent({ value }: { value: number }) {
      const report = useStable(() => seen(value));
      return <Child report={report} />;
    }
    const { rerender } = render(<Parent value={1} />);
    rerender(<Parent value={2} />);
    expect(seen.mock.calls).toEqual([[1], [2]]);
  });
});
