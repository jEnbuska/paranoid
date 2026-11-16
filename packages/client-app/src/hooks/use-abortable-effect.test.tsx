// @vitest-environment jsdom
import { Component, StrictMode, useState, type PropsWithChildren } from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useAbortableEffect } from "./use-abortable-effect.ts";

/** Runs the pending microtasks and state updates they cause */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));

/** Renders its children as they are, to compare with StrictMode */
function Plain({ children }: PropsWithChildren) {
  return <>{children}</>;
}

const modes = [
  { name: "in StrictMode", Wrapper: StrictMode },
  { name: "without StrictMode", Wrapper: Plain },
];

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

beforeEach(() => {
  // React logs the errors an error boundary catches
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(modes)("useAbortableEffect $name", ({ Wrapper }) => {
  describe("the callback", () => {
    test("runs once, after the effect and not during it", async () => {
      const callback = vi.fn();
      renderHook(() => useAbortableEffect(callback, []), { wrapper: Wrapper });

      expect(callback).not.toHaveBeenCalled();
      await flush();
      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith(expect.any(AbortSignal));
    });

    test("is not called again by a rerender when deps are []", async () => {
      const callback = vi.fn();
      const { rerender } = renderHook(() => useAbortableEffect(callback, []), {
        wrapper: Wrapper,
      });
      await flush();

      rerender();
      await flush();
      expect(callback).toHaveBeenCalledOnce();
    });

    test("runs after every render when deps are left out", async () => {
      const callback = vi.fn();
      const { rerender } = renderHook(() => useAbortableEffect(callback), {
        wrapper: Wrapper,
      });
      await flush();
      rerender();
      await flush();
      rerender();
      await flush();

      expect(callback).toHaveBeenCalledTimes(3);
    });

    test("is skipped when the component unmounts before it runs", async () => {
      const callback = vi.fn();
      const { unmount } = renderHook(() => useAbortableEffect(callback, []), {
        wrapper: Wrapper,
      });

      unmount();
      await flush();
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("the signal", () => {
    test("stays open while the component is mounted", async () => {
      const signals: AbortSignal[] = [];
      renderHook(
        () =>
          useAbortableEffect((signal) => {
            signals.push(signal);
          }, []),
        { wrapper: Wrapper },
      );
      await flush();

      expect(signals).toHaveLength(1);
      expect(signals[0].aborted).toBe(false);
    });

    test("aborts when the component unmounts", async () => {
      const signals: AbortSignal[] = [];
      const { unmount } = renderHook(
        () =>
          useAbortableEffect((signal) => {
            signals.push(signal);
          }, []),
        { wrapper: Wrapper },
      );
      await flush();

      unmount();
      expect(signals[0].aborted).toBe(true);
    });

    test("aborts when deps change, and the next run gets a new one", async () => {
      const signals: AbortSignal[] = [];
      const { rerender } = renderHook(
        ({ dep }) =>
          useAbortableEffect(
            (signal) => {
              signals.push(signal);
            },
            [dep],
          ),
        { wrapper: Wrapper, initialProps: { dep: 1 } },
      );
      await flush();

      rerender({ dep: 1 });
      await flush();
      expect(signals).toHaveLength(1);

      rerender({ dep: 2 });
      await flush();
      expect(signals).toHaveLength(2);
      expect(signals[0].aborted).toBe(true);
      expect(signals[1].aborted).toBe(false);
    });
  });

  describe("errors", () => {
    function Effect({
      callback,
      dep = 0,
    }: {
      callback: (signal: AbortSignal) => unknown;
      dep?: number;
    }) {
      useAbortableEffect(callback, [dep]);
      return <p>Content</p>;
    }
    const inBoundary = (props: Parameters<typeof Effect>[0]) => (
      <Wrapper>
        <ErrorBoundary>
          <Effect {...props} />
        </ErrorBoundary>
      </Wrapper>
    );

    test("an error thrown by the callback reaches the error boundary", async () => {
      render(
        inBoundary({
          callback() {
            throw new Error("Thrown");
          },
        }),
      );
      await flush();

      expect(screen.getByRole("alert").textContent).toBe("Thrown");
    });

    test("a rejection reaches the error boundary", async () => {
      render(
        inBoundary({ callback: () => Promise.reject(new Error("Rejected")) }),
      );
      await flush();

      expect(screen.getByRole("alert").textContent).toBe("Rejected");
    });

    test("a rejection after the signal aborted is ignored", async () => {
      const callback = (signal: AbortSignal) =>
        new Promise<void>((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("Aborted"))),
        );
      const { rerender } = render(inBoundary({ callback, dep: 1 }));
      await flush();

      // The first run is aborted and rejects, which must not show an error
      rerender(inBoundary({ callback, dep: 2 }));
      await flush();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("Content")).toBeTruthy();
    });
  });
});

describe.each(modes)(
  "components using useAbortableEffect $name",
  ({ Wrapper }) => {
    afterEach(() => {
      cleanup();
    });

    test("a listener added with the signal handles each click once, until unmount", async () => {
      const onClick = vi.fn();
      function Listener() {
        useAbortableEffect((signal) => {
          window.addEventListener("click", onClick, { signal });
        }, []);
        return <p>Listening</p>;
      }
      const { unmount } = render(
        <Wrapper>
          <Listener />
        </Wrapper>,
      );
      await flush();

      window.dispatchEvent(new Event("click"));
      expect(onClick).toHaveBeenCalledOnce();

      unmount();
      window.dispatchEvent(new Event("click"));
      expect(onClick).toHaveBeenCalledOnce();
    });

    describe("fetching with the signal", () => {
      type Request = {
        id: string;
        signal: AbortSignal;
        respond: (name: string) => void;
      };
      let requests: Request[];
      function fetchUser(id: string, signal: AbortSignal) {
        return new Promise<string>((resolve, reject) => {
          requests.push({ id, signal, respond: resolve });
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      function User({ id }: { id: string }) {
        const [name, setName] = useState("Loading");
        useAbortableEffect(
          async (signal) => {
            setName(await fetchUser(id, signal));
          },
          [id],
        );
        return <p>{name}</p>;
      }
      const ui = (id: string) => (
        <Wrapper>
          <ErrorBoundary>
            <User id={id} />
          </ErrorBoundary>
        </Wrapper>
      );

      beforeEach(() => {
        requests = [];
      });

      test("sends one request and shows its result", async () => {
        render(ui("a"));
        await flush();
        expect(requests.map((r) => r.id)).toEqual(["a"]);
        expect(screen.getByText("Loading")).toBeTruthy();

        await act(async () => requests[0].respond("Ada"));
        expect(screen.getByText("Ada")).toBeTruthy();
      });

      test("aborts the request of the previous id when the id changes", async () => {
        const { rerender } = render(ui("a"));
        await flush();

        rerender(ui("b"));
        await flush();
        expect(requests.map((r) => r.id)).toEqual(["a", "b"]);
        expect(requests[0].signal.aborted).toBe(true);
        // The aborted request's rejection is not an error
        expect(screen.queryByRole("alert")).toBeNull();

        await act(async () => requests[1].respond("Grace"));
        expect(screen.getByText("Grace")).toBeTruthy();
      });

      test("aborts the request on unmount", async () => {
        const { unmount } = render(ui("a"));
        await flush();

        unmount();
        expect(requests[0].signal.aborted).toBe(true);
      });
    });

    describe("running a cleanup when the signal aborts", () => {
      function Closer({ onClose }: { onClose: () => void }) {
        useAbortableEffect((signal) => {
          signal.addEventListener("abort", onClose);
        }, []);
        return <p>Open</p>;
      }
      const ui = (onClose: () => void) => (
        <Wrapper>
          <Closer onClose={onClose} />
        </Wrapper>
      );

      test("does not run while mounted, including StrictMode's remount", async () => {
        const onClose = vi.fn();
        render(ui(onClose));
        await flush();

        expect(onClose).not.toHaveBeenCalled();
      });

      test("runs once when the component unmounts", async () => {
        const onClose = vi.fn();
        const { unmount } = render(ui(onClose));
        await flush();

        unmount();
        expect(onClose).toHaveBeenCalledOnce();
      });
    });
  },
);
