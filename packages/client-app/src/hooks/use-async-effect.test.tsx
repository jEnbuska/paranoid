// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import createResolvable from "shared-lib/utils/create-resolvable";
import useAsyncEffect from "./use-async-effect";

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

/** Lets every promise callback that is ready to run, run */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve)));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useAsyncEffect", () => {
  test("aborts the signal when the component unmounts", () => {
    const signals: AbortSignal[] = [];
    const { unmount } = renderHook(() =>
      useAsyncEffect((signal) => {
        signals.push(signal);
      }, []),
    );

    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);
    unmount();
    expect(signals[0].aborted).toBe(true);
  });

  test("gives each run a new signal, and aborts the previous one", () => {
    const signals: AbortSignal[] = [];
    const { rerender } = renderHook(
      ({ value }) =>
        useAsyncEffect(
          (signal) => {
            signals.push(signal);
          },
          [value],
        ),
      { initialProps: { value: 1 } },
    );

    rerender({ value: 1 });
    expect(signals).toHaveLength(1);

    rerender({ value: 2 });
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  test("removes listeners added with the signal", () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const { unmount } = renderHook(() =>
      useAsyncEffect((signal) => {
        target.addEventListener("ping", listener, { signal });
      }, []),
    );

    target.dispatchEvent(new Event("ping"));
    unmount();
    target.dispatchEvent(new Event("ping"));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("in StrictMode, aborts the first run's signal before it continues", async () => {
    const sent: string[] = [];
    renderHook(
      () =>
        useAsyncEffect(async (signal) => {
          await Promise.resolve();
          if (signal.aborted) return;
          sent.push("sent");
        }, []),
      { wrapper: StrictMode },
    );

    await settle();
    expect(sent).toEqual(["sent"]);
  });

  test("ignores a rejection after the signal has aborted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // The first run's promise rejects once the second run has aborted it,
    // while the component is still mounted
    const runs = [createResolvable(), createResolvable()];
    function Effect({ run }: { run: number }) {
      useAsyncEffect(() => runs[run].promise, [run]);
      return <p>Mounted</p>;
    }
    const { rerender, queryByRole, getByText } = render(
      <ErrorBoundary>
        <Effect run={0} />
      </ErrorBoundary>,
    );

    rerender(
      <ErrorBoundary>
        <Effect run={1} />
      </ErrorBoundary>,
    );
    runs[0].reject(new Error("Aborted while loading"));
    await settle();

    expect(queryByRole("alert")).toBeNull();
    expect(getByText("Mounted")).toBeTruthy();
  });

  test("sends a rejection to the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Effect() {
      useAsyncEffect(async () => {
        await Promise.resolve();
        throw new Error("Loading failed");
      }, []);
      return <p>Mounted</p>;
    }
    const { findByRole } = render(
      <ErrorBoundary>
        <Effect />
      </ErrorBoundary>,
    );

    expect((await findByRole("alert")).textContent).toBe("Loading failed");
  });

  test("sends a synchronous throw to the error boundary", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Effect() {
      useAsyncEffect(() => {
        throw new Error("Not connected");
      }, []);
      return <p>Mounted</p>;
    }
    const { findByRole } = render(
      <ErrorBoundary>
        <Effect />
      </ErrorBoundary>,
    );

    expect((await findByRole("alert")).textContent).toBe("Not connected");
  });
});
