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
import ChatPage from "./page.tsx";

/** Runs the pending microtasks and the state updates they cause */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));

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
    if (this.state.error) return <h1>{this.state.error.message}</h1>;
    return this.props.children;
  }
}

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
  const connection = Object.assign(new EventTarget(), {
    connectionState: "connected" as RTCPeerConnectionState,
  });
  const channel = Object.assign(new EventTarget(), {
    readyState: "open" as RTCDataChannelState,
    close: vi.fn(),
  });
  const sendMessage = vi.fn(async (_text: string) => {});
  const changeState = (state: RTCPeerConnectionState) =>
    act(() => {
      connection.connectionState = state;
      connection.dispatchEvent(new Event("connectionstatechange"));
    });

  const notice = () => screen.queryByRole("alert");
  const errorPage = () => screen.queryByRole("heading", { level: 1 });
  const sendButton = () =>
    screen.getByRole<HTMLButtonElement>("button", { name: "Send" });

  beforeEach(async () => {
    connection.connectionState = "connected";
    channel.readyState = "open";
    sendMessage.mockClear();
    const state = {
      ...defaultInviteContextState,
      peerDisplayName: "Bob",
      connection: connection as unknown as RTCPeerConnection,
      channel: channel as unknown as RTCDataChannel,
    };
    const messages = [
      { id: "1", createdAt: 0, createdBy: "other" as const, data: "Hello" },
    ];
    render(
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
              <MessageContext value={{ messages, sendMessage }}>
                <ChatPage />
              </MessageContext>
            </InviteStateContext>
          </MemoryRouter>
        </ErrorBoundary>
      </Wrapper>,
    );
    await flush();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Are you there?" },
    });
  });

  test("sends while connected", async () => {
    expect(notice()).toBeNull();
    await act(() => sendButton().click());
    expect(sendMessage).toHaveBeenCalledWith("Are you there?");
  });

  for (const state of ["disconnected", "connecting"] as const) {
    test(`while ${state}, shows a notice and doesn't send`, async () => {
      changeState(state);
      await flush();
      expect(notice()?.textContent).toBe(
        "Connection interrupted. Trying to reconnect…",
      );
      expect(screen.getByText("Hello")).toBeTruthy();
      expect(sendButton().disabled).toBe(true);
      fireEvent.submit(sendButton().form!);
      await flush();
      expect(sendMessage).not.toHaveBeenCalled();
    });
  }

  test("recovers when connected again", async () => {
    changeState("disconnected");
    await flush();
    changeState("connected");
    await flush();
    expect(notice()).toBeNull();
    expect(sendButton().disabled).toBe(false);
  });

  test("a connection that fails after a drop shows the error page", async () => {
    changeState("disconnected");
    await flush();
    changeState("failed");
    await flush();
    expect(errorPage()?.textContent).toBe("Connection to peer lost");
  });

  test("a channel that closes shows the error page", async () => {
    act(() => {
      channel.readyState = "closed";
      channel.dispatchEvent(new Event("close"));
    });
    await flush();
    expect(errorPage()?.textContent).toBe("Connection to peer lost");
  });
});
