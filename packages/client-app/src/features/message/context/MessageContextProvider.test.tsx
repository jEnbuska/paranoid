// @vitest-environment jsdom
import { StrictMode, use, type PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createChannelInbox } from "~/features/channel/inbox.ts";
import type { ChannelMessage, Decrypt } from "~/features/channel/types.ts";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import { defaultInviteContextState } from "~/features/invite/constants";
import type { Message } from "~/features/message/types";
import MessageContext from "./MessageContext.ts";
import MessageContextProvider from "./MessageContextProvider.tsx";

// "Encrypts" by turning into JSON
vi.mock("~/features/crypt/hooks.ts", () => ({
  useEncrypt: () => async (data: unknown) => JSON.stringify(data),
}));

/** An open channel to dispatch "message" on, which keeps what it sends */
function fakeChannel() {
  const target = new EventTarget();
  const sent: ChannelMessage[] = [];
  const channel = Object.assign(target, {
    readyState: "open",
    send: (data: string) => sent.push(JSON.parse(data)),
  }) as unknown as RTCDataChannel;
  const inbox = createChannelInbox(channel, decrypt);
  return {
    channel,
    inbox,
    sent,
    receive(message: ChannelMessage) {
      target.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(message) }),
      );
    },
  };
}

/** "Decrypts" by parsing JSON */
const decrypt: Decrypt = async (encrypted) => JSON.parse(encrypted);

/** Lets every promise callback that is ready to run, run */
const settle = () => new Promise((resolve) => setTimeout(resolve));

/** Runs the pending microtasks and the state updates they cause */
const flush = () => act(settle);

/**
 * A TEXT message from the peer. All have the same time, so the order comes
 * from the state, not from sorting. A peer can send `createdBy`, though it
 * isn't part of the channel message
 */
const text = (
  data: string,
  createdBy: Message["createdBy"] = "self",
): ChannelMessage => {
  const message: Message = { id: data, createdAt: 0, createdBy, data };
  return { type: "TEXT", data: message };
};

/** Renders its children as they are, to compare with StrictMode */
function Plain({ children }: PropsWithChildren) {
  return <>{children}</>;
}

const modes = [
  { name: "in StrictMode", Wrapper: StrictMode },
  { name: "without StrictMode", Wrapper: Plain },
];

function Messages() {
  const { messages, sendMessage } = use(MessageContext);
  return (
    <>
      <button
        onClick={() => {
          void sendMessage("sent first");
          void sendMessage("sent second");
        }}
      >
        Send two
      </button>
      <ol>
        {messages.map(({ id, createdBy, data }) => (
          <li key={id}>{`${createdBy}: ${data}`}</li>
        ))}
      </ol>
    </>
  );
}

const shownMessages = () =>
  screen.queryAllByRole("listitem").map(({ textContent }) => textContent);

const sendTwo = () =>
  act(() => screen.getByRole("button", { name: "Send two" }).click());

afterEach(() => {
  cleanup();
});

describe.each(modes)("MessageContextProvider $name", ({ Wrapper }) => {
  /** The provider under an invite whose data channel is `channel` */
  function ui(channel: RTCDataChannel | undefined) {
    const state = { ...defaultInviteContextState, channel };
    return (
      <Wrapper>
        <InviteStateContext.Provider
          value={{ state, getState: () => state, updateState: async () => {} }}
        >
          <MessageContextProvider>
            <Messages />
          </MessageContextProvider>
        </InviteStateContext.Provider>
      </Wrapper>
    );
  }

  test("keeps every TEXT message that waited in the inbox, in order", async () => {
    const { channel, receive } = fakeChannel();
    receive(text("first"));
    receive(text("second"));
    await settle();

    render(ui(channel));
    await flush();

    expect(shownMessages()).toEqual(["other: first", "other: second"]);
  });

  test("adds TEXT messages that arrive later", async () => {
    const { channel, receive } = fakeChannel();
    render(ui(channel));
    await flush();

    receive(text("first"));
    receive(text("second"));
    await flush();

    expect(shownMessages()).toEqual(["other: first", "other: second"]);
  });

  test("sends messages over the channel without createdBy and keeps every one as its own", async () => {
    const { channel, sent } = fakeChannel();
    render(ui(channel));
    await flush();

    sendTwo();
    await flush();

    const sentText = (data: string) => ({
      type: "TEXT",
      data: { id: expect.any(String), createdAt: expect.any(Number), data },
    });
    // Exactly these keys: who wrote a message isn't sent
    expect(sent).toEqual([sentText("sent first"), sentText("sent second")]);
    for (const message of sent) {
      expect(message.data).not.toHaveProperty("createdBy");
    }
    expect(shownMessages()).toEqual(["self: sent first", "self: sent second"]);
  });

  test("keeps sent and received messages that are added together", async () => {
    const { channel, receive } = fakeChannel();
    render(ui(channel));
    await flush();

    sendTwo();
    receive(text("received"));
    await flush();

    expect(shownMessages()).toHaveLength(3);
    expect(shownMessages()).toContain("other: received");
  });

  test("clears the messages when the channel changes, and takes from the new one", async () => {
    const first = fakeChannel();
    const second = fakeChannel();
    first.receive(text("old"));
    await settle();
    const { rerender } = render(ui(first.channel));
    await flush();
    expect(shownMessages()).toEqual(["other: old"]);

    rerender(ui(second.channel));
    await flush();
    expect(shownMessages()).toEqual([]);

    first.receive(text("old again"));
    second.receive(text("new"));
    await flush();
    expect(shownMessages()).toEqual(["other: new"]);
  });

  test("clears the messages when the invite is reset", async () => {
    const { channel, inbox, receive } = fakeChannel();
    receive(text("old"));
    await settle();
    const { rerender } = render(ui(channel));
    await flush();
    expect(shownMessages()).toEqual(["other: old"]);

    // What `resetInviteContext` does: clear the inbox and drop the channel
    inbox.clear();
    rerender(ui(undefined));
    await flush();

    expect(shownMessages()).toEqual([]);
  });
});
