// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import useComponentDidMount from "./use-component-did-mount";

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

/** Lets timeouts and promise callbacks that are ready to run, run */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve)));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useComponentDidMount", () => {
  test("in StrictMode, runs once and keeps its signal", async () => {
    const signals: AbortSignal[] = [];
    renderHook(
      () =>
        useComponentDidMount((signal) => {
          signals.push(signal);
        }),
      { wrapper: StrictMode },
    );

    await settle();
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
  });

  test("does not run again when the component renders again", () => {
    const callback = vi.fn();
    const { rerender } = renderHook(() => useComponentDidMount(callback));

    rerender();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test("aborts the signal when the component unmounts", async () => {
    const signals: AbortSignal[] = [];
    const { unmount } = renderHook(() =>
      useComponentDidMount((signal) => {
        signals.push(signal);
      }),
    );

    unmount();
    await settle();
    expect(signals[0].aborted).toBe(true);
  });

  test("removes listeners added with the signal on unmount", async () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const { unmount } = renderHook(
      () =>
        useComponentDidMount((signal) => {
          target.addEventListener("ping", listener, { signal });
        }),
      { wrapper: StrictMode },
    );

    target.dispatchEvent(new Event("ping"));
    expect(listener).toHaveBeenCalledTimes(1);
    unmount();
    await settle();
    target.dispatchEvent(new Event("ping"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("sends a rejection to the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Effect() {
      useComponentDidMount(async () => {
        await Promise.resolve();
        throw new Error("Loading failed");
      });
      return <p>Mounted</p>;
    }
    const { findByRole } = render(
      <StrictMode>
        <ErrorBoundary>
          <Effect />
        </ErrorBoundary>
      </StrictMode>,
    );

    expect((await findByRole("alert")).textContent).toBe("Loading failed");
  });
});
