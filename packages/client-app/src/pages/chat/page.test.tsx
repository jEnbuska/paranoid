// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import { defaultInviteContextState } from "~/features/invite/constants";
import MessageContext from "~/features/message/context/MessageContext.ts";
import type { Message } from "~/features/message/types";
import ChatPage from "./page.tsx";

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
    if (this.state.error) {
      return <p data-testid="error-page">{this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

/** A connected peer connection, whose state the test changes */
function fakeConnection() {
  const connection = Object.assign(new EventTarget(), {
    connectionState: "connected" as RTCPeerConnectionState,
    close: vi.fn(),
  });
  return {
    connection,
    change(state: RTCPeerConnectionState) {
      connection.connectionState = state;
      connection.dispatchEvent(new Event("connectionstatechange"));
    },
  };
}

/** An open data channel */
function fakeChannel() {
  return Object.assign(new EventTarget(), {
    readyState: "open" as RTCDataChannelState,
    close: vi.fn(),
  });
}

const received: Message = {
  id: "1",
  createdAt: 0,
  createdBy: "other",
  data: "Hello there",
};

const warning = () =>
  screen
    .queryAllByRole("alert")
    .find((it) => it.textContent?.includes("interrupted"));

const errorPage = () => screen.queryByTestId("error-page")?.textContent;
const sendButton = () =>
  screen.getByRole("button", { name: "Send" }) as HTMLButtonElement;
const type = (text: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: text },
  });

beforeEach(() => {
  // React logs the errors an error boundary catches
  vi.spyOn(console, "error").mockImplementation(() => {});
  // jsdom doesn't scroll, and the message list scrolls to the newest message
  Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(modes)("the chat page $name", ({ Wrapper }) => {
  let connection: ReturnType<typeof fakeConnection>;
  let channel: ReturnType<typeof fakeChannel>;
  let sendMessage: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

  function ui() {
    const state = {
      ...defaultInviteContextState,
      peerDisplayName: "Bob",
      connection: connection.connection as unknown as RTCPeerConnection,
      channel: channel as unknown as RTCDataChannel,
    };
    return (
      <Wrapper>
        <ErrorBoundary>
          <MemoryRouter initialEntries={["/chat"]}>
            <InviteStateContext
              value={{
                state,
                getState: () => state,
                updateState: async () => {},
              }}
            >
              <MessageContext value={{ messages: [received], sendMessage }}>
                <ChatPage />
              </MessageContext>
            </InviteStateContext>
          </MemoryRouter>
        </ErrorBoundary>
      </Wrapper>
    );
  }

  /** Renders the page connected, with a message typed */
  async function renderTyped() {
    render(ui());
    await flush();
    type("Are you there?");
  }

  beforeEach(() => {
    connection = fakeConnection();
    channel = fakeChannel();
    sendMessage = vi.fn(async () => {});
  });

  test("sends while connected with the channel open", async () => {
    await renderTyped();
    expect(warning()).toBeUndefined();
    expect(sendButton().disabled).toBe(false);

    await act(() => sendButton().click());
    await flush();
    expect(sendMessage).toHaveBeenCalledWith("Are you there?");
  });

  for (const state of ["disconnected", "connecting", "new"] as const) {
    test(`while ${state}, shows a notice, keeps the messages and doesn't send`, async () => {
      await renderTyped();
      act(() => connection.change(state));
      await flush();

      expect(warning()?.textContent).toBe(
        "Connection to the peer interrupted. Trying to reconnect…",
      );
      expect(screen.getByText("Hello there")).toBeTruthy();
      expect(sendButton().disabled).toBe(true);
      fireEvent.submit(sendButton().form!);
      fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), {
        key: "Enter",
      });
      await flush();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(errorPage()).toBeUndefined();
    });
  }

  test("doesn't send while the channel isn't open", async () => {
    channel.readyState = "connecting";
    await renderTyped();
    expect(warning()).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
  });

  test("recovers when the connection is back", async () => {
    await renderTyped();
    act(() => connection.change("disconnected"));
    await flush();
    expect(warning()).toBeTruthy();

    act(() => connection.change("connected"));
    await flush();
    expect(warning()).toBeUndefined();
    expect(sendButton().disabled).toBe(false);
    expect(screen.getByText("Hello there")).toBeTruthy();
    expect(connection.connection.close).not.toHaveBeenCalled();
  });

  test("a connection that fails after a drop shows the error page, closed", async () => {
    await renderTyped();
    act(() => connection.change("disconnected"));
    await flush();

    act(() => connection.change("failed"));
    await flush();
    expect(errorPage()).toBe("Connection to the peer lost");
    expect(connection.connection.close).toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalled();
  });

  test("a connection that fails shows the error page, closed", async () => {
    render(ui());
    await flush();

    act(() => connection.change("failed"));
    await flush();
    expect(errorPage()).toBe("Connection to the peer lost");
    expect(connection.connection.close).toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalled();
  });

  test("a channel that closes shows the error page, closed", async () => {
    render(ui());
    await flush();

    act(() => {
      channel.readyState = "closed";
      channel.dispatchEvent(new Event("close"));
    });
    await flush();
    expect(errorPage()).toBe("Connection to the peer lost");
    expect(connection.connection.close).toHaveBeenCalled();
  });

  test("a channel that closed before the page showed shows the error page", async () => {
    channel.readyState = "closed";
    render(ui());
    await flush();
    expect(errorPage()).toBe("Connection to the peer lost");
  });
});
