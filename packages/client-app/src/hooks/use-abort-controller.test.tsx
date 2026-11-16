// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { useAbortController } from "./use-abort-controller.ts";

/** Runs the pending microtasks and state updates they cause */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));

/** Renders its children as they are, to compare with StrictMode */
function Plain({ children }: PropsWithChildren) {
  return <>{children}</>;
}

afterEach(cleanup);

describe.each([
  { name: "in StrictMode", Wrapper: StrictMode },
  { name: "without StrictMode", Wrapper: Plain },
])("useAbortController $name", ({ Wrapper }) => {
  test("returns the same controller on every render", async () => {
    const { result, rerender } = renderHook(() => useAbortController(), {
      wrapper: Wrapper,
    });
    const first = result.current;
    await flush();

    rerender();
    expect(result.current).toBe(first);
  });

  test("stays open while the component is mounted", async () => {
    const { result, rerender } = renderHook(() => useAbortController(), {
      wrapper: Wrapper,
    });
    await flush();
    rerender();
    await flush();

    expect(result.current.signal.aborted).toBe(false);
  });

  test("aborts when the component unmounts", async () => {
    const { result, unmount } = renderHook(() => useAbortController(), {
      wrapper: Wrapper,
    });
    await flush();

    unmount();
    expect(result.current.signal.aborted).toBe(true);
  });
});
