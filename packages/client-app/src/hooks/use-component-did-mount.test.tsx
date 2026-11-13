// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useComponentDidMount from "./use-component-did-mount";

/**
 * The hook with the signature from issue #20. Remove this cast once the hook
 * itself takes a callback that gets a signal.
 */
const useDidMount = useComponentDidMount as (
  callback: (signal: AbortSignal) => void | Promise<void>,
) => void;

/** Waits until the current task and its microtasks have finished */
const nextTask = () => new Promise((resolve) => setTimeout(resolve));

afterEach(cleanup);

describe("useComponentDidMount in StrictMode", () => {
  test("runs its callback once", async () => {
    const callback = vi.fn();
    const { rerender } = renderHook(() => useDidMount(callback), {
      wrapper: StrictMode,
    });

    rerender();
    await nextTask();
    expect(callback).toHaveBeenCalledOnce();
  });

  test("passes the callback an AbortSignal", () => {
    const callback = vi.fn();
    renderHook(() => useDidMount(callback), { wrapper: StrictMode });

    expect(callback).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  test("still runs a callback that takes no arguments", () => {
    let ran = 0;
    renderHook(
      () =>
        useComponentDidMount(() => {
          ran++;
        }),
      { wrapper: StrictMode },
    );

    expect(ran).toBe(1);
  });

  test("does not abort the signal for the simulated unmount", async () => {
    const signals: AbortSignal[] = [];
    renderHook(() => useDidMount((signal) => void signals.push(signal)), {
      wrapper: StrictMode,
    });

    await nextTask();
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0].aborted).toBe(false);
  });

  test("aborts the signal once on the real unmount, before the next task", async () => {
    const onAbort = vi.fn();
    const { unmount } = renderHook(
      () =>
        useDidMount((signal) => {
          signal.addEventListener("abort", onAbort);
        }),
      { wrapper: StrictMode },
    );

    unmount();
    const nextTaskRan = vi.fn();
    setTimeout(nextTaskRan);
    await Promise.resolve();
    expect(onAbort).toHaveBeenCalledOnce();
    expect(nextTaskRan).not.toHaveBeenCalled();

    await nextTask();
    expect(onAbort).toHaveBeenCalledOnce();
  });

  test("accepts an async callback, whose signal aborts while it waits", async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    const abortedAfterWait = vi.fn();
    const { unmount } = renderHook(
      () =>
        useDidMount(async (signal) => {
          await promise;
          abortedAfterWait(signal.aborted);
        }),
      { wrapper: StrictMode },
    );

    unmount();
    resolve();
    await nextTask();
    expect(abortedAfterWait).toHaveBeenCalledExactlyOnceWith(true);
  });
});
