// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
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

/** Shows the error it caught, as the app's error boundary would */
class ErrorBoundary extends Component<PropsWithChildren, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <p role="alert">{this.state.error.message}</p>;
    return this.props.children;
  }
}

/** Mounts a component that runs `callback` on mount, inside an error boundary */
function renderInBoundary(
  callback: (signal: AbortSignal) => void | Promise<void>,
) {
  function Effect() {
    useDidMount(callback);
    return null;
  }
  const ui = (mounted: boolean) => (
    <StrictMode>
      <ErrorBoundary>
        <p>Boundary</p>
        {mounted && <Effect />}
      </ErrorBoundary>
    </StrictMode>
  );
  const { rerender } = render(ui(true));
  return { unmountEffect: () => rerender(ui(false)) };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  test("passes the callback an AbortSignal", async () => {
    const callback = vi.fn();
    renderHook(() => useDidMount(callback), { wrapper: StrictMode });

    await nextTask();
    expect(callback).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  test("still runs a callback that takes no arguments", async () => {
    let ran = 0;
    renderHook(
      () =>
        useComponentDidMount(() => {
          ran++;
        }),
      { wrapper: StrictMode },
    );

    await nextTask();
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

  test("aborts the signal once on the real unmount", async () => {
    const onAbort = vi.fn();
    const { unmount } = renderHook(
      () =>
        useDidMount((signal) => {
          signal.addEventListener("abort", onAbort);
        }),
      { wrapper: StrictMode },
    );

    await nextTask();
    unmount();
    await nextTask();
    expect(onAbort).toHaveBeenCalledOnce();
  });

  test("sends an async callback's rejection to the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderInBoundary(async () => {
      await Promise.resolve();
      throw new Error("Loading failed");
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Loading failed",
    );
  });

  test("ignores a rejection after the signal has aborted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { promise, resolve } = Promise.withResolvers<void>();
    const { unmountEffect } = renderInBoundary(async () => {
      await promise;
      throw new Error("Rejected after unmount");
    });

    await nextTask();
    unmountEffect();
    resolve();
    await nextTask();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Boundary")).toBeTruthy();
  });
});
