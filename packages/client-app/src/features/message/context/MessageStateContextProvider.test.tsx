// @vitest-environment jsdom
import { StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { createChannelInbox } from "~/features/channel/inbox.ts";
import type { ChannelMessage, Decrypt } from "~/features/channel/types.ts";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import { defaultInviteContextState } from "~/features/invite/constants";
import { useAddMessage, useMessageState } from "~/features/message/hooks";
import type { MessageData } from "~/features/message/types";
import MessageStateContextProvider from "./MessageStateContextProvider";

/** A channel to dispatch "message" on */
function fakeChannel() {
  const target = new EventTarget();
  const channel = target as RTCDataChannel;
  const inbox = createChannelInbox(channel, decrypt);
  return {
    channel,
    inbox,
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

const message = (data: string): MessageData => ({
  id: data,
  createdAt: 0,
  createdBy: "peer",
  data,
});

const text = (data: string): ChannelMessage => ({
  type: "TEXT",
  data: message(data),
});

/** Renders its children as they are, to compare with StrictMode */
function Plain({ children }: PropsWithChildren) {
  return <>{children}</>;
}

const modes = [
  { name: "in StrictMode", Wrapper: StrictMode },
  { name: "without StrictMode", Wrapper: Plain },
];

function Messages() {
  const { messages } = useMessageState();
  return (
    <ol>
      {messages.map(({ id, data }) => (
        <li key={id}>{data}</li>
      ))}
    </ol>
  );
}

const shownMessages = () =>
  screen.queryAllByRole("listitem").map(({ textContent }) => textContent);

afterEach(() => {
  cleanup();
});

describe.each(modes)("MessageStateContextProvider $name", ({ Wrapper }) => {
  /** The provider under an invite whose data channel is `channel` */
  function ui(channel: RTCDataChannel | undefined, children = <Messages />) {
    const state = { ...defaultInviteContextState, channel };
    return (
      <Wrapper>
        <InviteStateContext.Provider
          value={{ state, getState: () => state, updateState: async () => {} }}
        >
          <MessageStateContextProvider>{children}</MessageStateContextProvider>
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

    expect(shownMessages()).toEqual(["first", "second"]);
  });

  test("adds TEXT messages that arrive later", async () => {
    const { channel, receive } = fakeChannel();
    render(ui(channel));
    await flush();

    receive(text("first"));
    receive(text("second"));
    await flush();

    expect(shownMessages()).toEqual(["first", "second"]);
  });

  test("keeps every message useAddMessage adds before React renders", async () => {
    const { channel } = fakeChannel();
    let addMessage = (_: MessageData) => {};
    function Adder() {
      addMessage = useAddMessage();
      return <Messages />;
    }
    render(ui(channel, <Adder />));
    await flush();

    act(() => {
      addMessage(message("first"));
      addMessage(message("second"));
    });

    expect(shownMessages()).toEqual(["first", "second"]);
  });

  test("clears the messages when the channel changes, and takes from the new one", async () => {
    const first = fakeChannel();
    const second = fakeChannel();
    first.receive(text("old"));
    await settle();
    const { rerender } = render(ui(first.channel));
    await flush();
    expect(shownMessages()).toEqual(["old"]);

    rerender(ui(second.channel));
    await flush();
    expect(shownMessages()).toEqual([]);

    first.receive(text("old again"));
    second.receive(text("new"));
    await flush();
    expect(shownMessages()).toEqual(["new"]);
  });

  test("clears the messages when the invite is reset", async () => {
    const { channel, inbox, receive } = fakeChannel();
    receive(text("old"));
    await settle();
    const { rerender } = render(ui(channel));
    await flush();
    expect(shownMessages()).toEqual(["old"]);

    // What `resetInviteContext` does: clear the inbox and drop the channel
    inbox.clear();
    rerender(ui(undefined));
    await flush();

    expect(shownMessages()).toEqual([]);
  });
});
