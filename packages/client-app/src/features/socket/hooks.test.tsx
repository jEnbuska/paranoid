// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useOnEvent } from "./hooks.ts";

/**
 * An inbox whose `take` waits for the test to deliver an event. Node has no
 * `Map.getOrInsertComputed` yet, so the real queue can't run here
 */
function fakeInbox() {
  const waiters: Array<{ type: string; resolve: (args: unknown[]) => void }> =
    [];
  return {
    take(type: string, signal: AbortSignal) {
      return new Promise<unknown[]>((resolve, reject) => {
        const waiter = { type, resolve };
        waiters.push(waiter);
        signal.addEventListener("abort", () => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(signal.reason);
        });
      });
    },
    receive(type: string, ...args: unknown[]) {
      const index = waiters.findIndex((it) => it.type === type);
      if (index !== -1) waiters.splice(index, 1)[0].resolve(args);
    },
  };
}

let inbox: ReturnType<typeof fakeInbox>;

vi.mock("~/features/socket/inbox.ts", () => ({
  useInbox: () => inbox,
}));

/** Runs the pending microtasks and the state updates they cause */
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
  inbox = fakeInbox();
  // React logs the errors an error boundary catches
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(modes)("useOnEvent $name", ({ Wrapper }) => {
  function Listener({ handler }: { handler: () => unknown }) {
    useOnEvent("CLOSE", handler);
    return <p>Listening</p>;
  }
  const ui = (handler: () => unknown) => (
    <Wrapper>
      <ErrorBoundary>
        <Listener handler={handler} />
      </ErrorBoundary>
    </Wrapper>
  );

  test("calls the handler for each event", async () => {
    const handler = vi.fn();
    render(ui(handler));
    await flush();

    inbox.receive("CLOSE");
    await flush();
    inbox.receive("CLOSE");
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  test("an error thrown by the handler reaches the error boundary", async () => {
    render(
      ui(() => {
        throw new Error("Invite was closed");
      }),
    );
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();

    inbox.receive("CLOSE");
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Invite was closed");
  });

  test("a rejection of the handler reaches the error boundary", async () => {
    render(ui(() => Promise.reject(new Error("Rejected"))));
    await flush();

    inbox.receive("CLOSE");
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("Rejected");
  });

  test("stops taking events after unmount", async () => {
    const handler = vi.fn();
    const { unmount } = render(ui(handler));
    await flush();

    unmount();
    inbox.receive("CLOSE");
    await flush();
    expect(handler).not.toHaveBeenCalled();
  });
});
