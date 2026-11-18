import { describe, expect, test, vi } from "vitest";
import createResolvable from "shared-lib/utils/create-resolvable";
import { createChannelInbox } from "./inbox";
import type { ChannelMessage, Decrypt } from "./types";

/** A channel to dispatch "message" and "close" on */
function fakeChannel() {
  const target = new EventTarget();
  const channel = target as RTCDataChannel;
  return {
    channel,
    receive(message: ChannelMessage) {
      target.dispatchEvent(
        new MessageEvent("message", { data: JSON.stringify(message) }),
      );
    },
    close() {
      target.dispatchEvent(new Event("close"));
    },
  };
}

/** "Decrypts" by parsing JSON */
const decrypt: Decrypt = async (encrypted) => JSON.parse(encrypted);

/** Lets every promise callback that is ready to run, run */
const settle = () => new Promise((resolve) => setTimeout(resolve));

const signal = new AbortController().signal;

const text = (data: string): ChannelMessage => ({
  type: "TEXT",
  data: { id: data, createdAt: 0, data },
});

describe("createChannelInbox", () => {
  test("keeps a message that arrives before take", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);

    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await settle();

    await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
  });

  test("a waiting take gets the next message", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);

    const taken = inbox.take("DISPLAY_NAME", signal);
    receive({ type: "DISPLAY_NAME", data: "Bob" });

    await expect(taken).resolves.toBe("Bob");
  });

  test("keeps the arrival order when a later message decrypts first", async () => {
    const { channel, receive } = fakeChannel();
    const slow = createResolvable();
    const inbox = createChannelInbox(channel, async (encrypted) => {
      const message = JSON.parse(encrypted);
      if (message.data.data === "first") await slow.promise;
      return message;
    });

    const takenFirst = inbox.take("TEXT", signal);
    receive(text("first"));
    receive(text("second"));
    await settle();
    // The second one has decrypted, but waits for the first
    const takenSecond = inbox.take("TEXT", signal);

    slow.resolve();
    await expect(takenFirst).resolves.toMatchObject({ data: "first" });
    await expect(takenSecond).resolves.toMatchObject({ data: "second" });
  });

  test("keeps the order of many messages that take different times", async () => {
    const { channel, receive } = fakeChannel();
    const delays = [15, 0, 10, 0, 5];
    const inbox = createChannelInbox(channel, async (encrypted) => {
      const message = JSON.parse(encrypted);
      await new Promise((resolve) =>
        setTimeout(resolve, delays[Number(message.data.data)]),
      );
      return message;
    });

    delays.forEach((_, index) => receive(text(String(index))));
    const taken: string[] = [];
    for (const _ of delays) taken.push((await inbox.take("TEXT", signal)).data);

    expect(taken).toEqual(["0", "1", "2", "3", "4"]);
  });

  test("keeps types apart", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);

    receive(text("hello"));
    receive({ type: "CANDIDATE", data: { candidate: "candidate" } });
    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await settle();

    await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
    await expect(inbox.take("CANDIDATE", signal)).resolves.toEqual({
      candidate: "candidate",
    });
    await expect(inbox.take("TEXT", signal)).resolves.toMatchObject({
      data: "hello",
    });
  });

  test("an aborted take rejects, and the message goes to the next take", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    const controller = new AbortController();

    const aborted = inbox.take("DISPLAY_NAME", controller.signal);
    controller.abort(new Error("Unmounted"));
    await expect(aborted).rejects.toThrow("Unmounted");

    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
  });

  test("a take with an aborted signal rejects without taking a message", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await settle();

    await expect(
      inbox.take("DISPLAY_NAME", AbortSignal.abort(new Error("Aborted"))),
    ).rejects.toThrow("Aborted");
    await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
  });

  test("skips a message that fails to decrypt", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, async (encrypted) => {
      const message = JSON.parse(encrypted);
      if (message.data === "broken") throw new Error("Failed to decrypt");
      return message;
    });
    const error = console.error;
    console.error = () => {};
    try {
      receive({ type: "DISPLAY_NAME", data: "broken" });
      receive({ type: "DISPLAY_NAME", data: "Bob" });
      await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
    } finally {
      console.error = error;
    }
  });

  test.each([
    ["no data", { type: "TEXT" }],
    ["data that isn't an object", { type: "TEXT", data: "hello" }],
    ["null data", { type: "TEXT", data: null }],
    ["no text", { type: "TEXT", data: { id: "a", createdAt: 0 } }],
    [
      "text that isn't a string",
      {
        type: "TEXT",
        data: { id: "a", createdAt: 0, data: { text: "secret" } },
      },
    ],
    ["no id", { type: "TEXT", data: { createdAt: 0, data: "secret" } }],
    [
      "a createdAt that isn't a number",
      { type: "TEXT", data: { id: "a", createdAt: "0", data: "secret" } },
    ],
  ])("drops a TEXT with %s and delivers the next one", async (_, malformed) => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const taken = inbox.take("TEXT", signal);
      receive(malformed as ChannelMessage);
      receive(text("hello"));

      await expect(taken).resolves.toMatchObject({ data: "hello" });
      expect(error).toHaveBeenCalledOnce();
      // The log never has the content
      expect(JSON.stringify(error.mock.calls)).not.toContain("secret");
    } finally {
      error.mockRestore();
    }
  });

  test.each([
    ["no data", { type: "DISPLAY_NAME" }],
    ["a number", { type: "DISPLAY_NAME", data: 7 }],
    ["an object", { type: "DISPLAY_NAME", data: { name: "Mallory" } }],
  ])(
    "drops a DISPLAY_NAME with %s and delivers the next one",
    async (_, malformed) => {
      const { channel, receive } = fakeChannel();
      const inbox = createChannelInbox(channel, decrypt);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        receive(malformed as ChannelMessage);
        receive({ type: "DISPLAY_NAME", data: "Bob" });
        await settle();

        await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
        expect(error).toHaveBeenCalledOnce();
        expect(JSON.stringify(error.mock.calls)).not.toContain("Mallory");
      } finally {
        error.mockRestore();
      }
    },
  );

  test("drops a CANDIDATE whose candidate isn't a string", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      receive({
        type: "CANDIDATE",
        data: { candidate: 7 },
      } as unknown as ChannelMessage);
      receive({
        type: "CANDIDATE",
        data: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 },
      });
      await settle();

      await expect(inbox.take("CANDIDATE", signal)).resolves.toMatchObject({
        candidate: "candidate",
      });
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  test("strips keys a type doesn't have, such as createdBy", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);

    receive({
      type: "TEXT",
      data: { id: "a", createdAt: 0, data: "hello", createdBy: "self" },
    } as ChannelMessage);

    await expect(inbox.take("TEXT", signal)).resolves.toStrictEqual({
      id: "a",
      createdAt: 0,
      data: "hello",
    });
  });

  test("ignores a message that isn't an object", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);

    receive(null as unknown as ChannelMessage);
    receive("TEXT" as unknown as ChannelMessage);
    receive({ type: "toString", data: "Bob" } as unknown as ChannelMessage);
    receive({ type: "DISPLAY_NAME", data: "Bob" });

    await expect(inbox.take("DISPLAY_NAME", signal)).resolves.toBe("Bob");
  });

  test("clearing drops unread messages and stops reading", async () => {
    const { channel, receive } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await settle();

    inbox.clear();
    receive({ type: "DISPLAY_NAME", data: "Alice" });
    await settle();

    expect(inbox.signal.aborted).toBe(true);
    const controller = new AbortController();
    const taken = inbox.take("DISPLAY_NAME", controller.signal);
    let settled = false;
    taken.then(
      () => (settled = true),
      () => {},
    );
    await settle();
    expect(settled).toBe(false);
    controller.abort();
    await expect(taken).rejects.toBeDefined();
  });

  test("clearing drops a message that was still decrypting", async () => {
    const { channel, receive } = fakeChannel();
    const slow = createResolvable();
    const inbox = createChannelInbox(channel, async (encrypted) => {
      await slow.promise;
      return JSON.parse(encrypted);
    });
    const controller = new AbortController();
    const taken = inbox.take("DISPLAY_NAME", controller.signal);
    receive({ type: "DISPLAY_NAME", data: "Bob" });

    inbox.clear();
    slow.resolve();
    await settle();

    let settled = false;
    taken.then(
      () => (settled = true),
      () => {},
    );
    await settle();
    expect(settled).toBe(false);
    controller.abort();
  });

  test("closing the channel clears the inbox", async () => {
    const { channel, receive, close } = fakeChannel();
    const inbox = createChannelInbox(channel, decrypt);
    receive({ type: "DISPLAY_NAME", data: "Bob" });
    await settle();

    close();

    expect(inbox.signal.aborted).toBe(true);
    const controller = new AbortController();
    const taken = inbox.take("DISPLAY_NAME", controller.signal);
    controller.abort(new Error("Nothing came"));
    await expect(taken).rejects.toThrow("Nothing came");
  });
});
