// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useComponentDidUnmount } from "./use-component-did-unmount";

/** Waits until the current task and its microtasks have finished */
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

afterEach(cleanup);

describe("useComponentDidUnmount in StrictMode", () => {
  test("does not run its callback for the simulated unmount", async () => {
    const callback = vi.fn();
    renderHook(() => useComponentDidUnmount(callback), {
      wrapper: StrictMode,
    });

    await nextTask();
    expect(callback).not.toHaveBeenCalled();
  });

  test("runs its callback once on the real unmount, in a microtask", async () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useComponentDidUnmount(callback), {
      wrapper: StrictMode,
    });

    // Unmounts in the same task as the mount, so the simulated unmount's
    // microtask hasn't run yet. It must not run the callback a second time.
    unmount();
    expect(callback).not.toHaveBeenCalled();
    const nextTaskRan = vi.fn();
    setTimeout(nextTaskRan);
    await Promise.resolve();
    expect(callback).toHaveBeenCalledOnce();
    expect(nextTaskRan).not.toHaveBeenCalled();

    await nextTask();
    expect(callback).toHaveBeenCalledOnce();
  });
});
