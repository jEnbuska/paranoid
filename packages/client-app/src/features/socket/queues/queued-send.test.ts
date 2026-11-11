import { describe, expect, test } from "vitest";
import createResolvable from "shared-lib/utils/create-resolvable";
import type { AppSocket } from "~/features/socket/types";
import { createQueuedSend } from "./queued-send";

/** A socket that records what is emitted on it, as [type, ...args] */
function fakeSocket() {
  const emitted: unknown[][] = [];
  const socket = {
    emit: (...args: unknown[]) => {
      emitted.push(args);
    },
  } as unknown as AppSocket;
  return { socket, emitted };
}

/** For sends whose queue is never cleared */
const noClear = () => {};

/** An encrypted description, as it is sent */
const description = "encrypted description";

/** Lets every promise callback that is ready to run, run */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("createQueuedSend", () => {
  test("emits on the socket", async () => {
    const { socket, emitted } = fakeSocket();
    const send = createQueuedSend(socket, noClear);

    await send((emit) => emit("DESCRIPTION", description));
    await send((emit) => emit("DONE"));

    expect(emitted).toEqual([["DESCRIPTION", description], ["DONE"]]);
  });

  test("an instant send waits for a slower one queued before it", async () => {
    const { socket, emitted } = fakeSocket();
    const send = createQueuedSend(socket, noClear);
    const encrypted = createResolvable();

    const sentDescription = send(async (emit) => {
      await encrypted.promise;
      emit("DESCRIPTION", description);
    });
    const sentDone = send((emit) => emit("DONE"));

    await settle();
    expect(emitted).toEqual([]);

    encrypted.resolve();
    await Promise.all([sentDescription, sentDone]);
    expect(emitted).toEqual([["DESCRIPTION", description], ["DONE"]]);
  });

  test("keeps the order of many sends that take different times", async () => {
    const { socket, emitted } = fakeSocket();
    const send = createQueuedSend(socket, noClear);
    const delays = [15, 0, 10, 0, 5];

    await Promise.all(
      delays.map((delay, index) =>
        send(async (emit) => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          emit("DESCRIPTION", String(index));
        }),
      ),
    );

    expect(emitted.map(([, sent]) => sent)).toEqual(["0", "1", "2", "3", "4"]);
  });

  test("starts a send only when the one before it has finished", async () => {
    const send = createQueuedSend(fakeSocket().socket, noClear);
    const first = createResolvable();
    let secondStarted = false;

    void send(() => first.promise);
    const second = send(() => {
      secondStarted = true;
    });

    await settle();
    expect(secondStarted).toBe(false);

    first.resolve();
    await second;
    expect(secondStarted).toBe(true);
  });

  test("resolves with what the send returns", async () => {
    const send = createQueuedSend(fakeSocket().socket, noClear);
    await expect(send(() => "sync")).resolves.toBe("sync");
    await expect(send(async () => "async")).resolves.toBe("async");
  });

  test("a send that rejects fails alone, and the next one still runs", async () => {
    const { socket, emitted } = fakeSocket();
    const send = createQueuedSend(socket, noClear);
    const failed = send(async () => {
      throw new Error("Encryption failed");
    });
    const next = send((emit) => emit("DONE"));

    await expect(failed).rejects.toThrow("Encryption failed");
    await next;
    expect(emitted).toEqual([["DONE"]]);
  });

  test("a send that throws fails alone, and the next one still runs", async () => {
    const { socket, emitted } = fakeSocket();
    const send = createQueuedSend(socket, noClear);
    const failed = send(() => {
      throw new Error("Not connected");
    });
    const next = send((emit) => emit("DONE"));

    await expect(failed).rejects.toThrow("Not connected");
    await next;
    expect(emitted).toEqual([["DONE"]]);
  });

  test("sockets don't wait for each other", async () => {
    const blocked = createResolvable();
    const other = fakeSocket();

    void createQueuedSend(fakeSocket().socket, noClear)(() => blocked.promise);
    await createQueuedSend(other.socket, noClear)((emit) => emit("DONE"));

    expect(other.emitted).toEqual([["DONE"]]);
    blocked.resolve();
  });

  test("after a clear, new sends don't wait for the ones queued before it", async () => {
    const { socket, emitted } = fakeSocket();
    let clear = () => {};
    const send = createQueuedSend(socket, (callback) => {
      clear = callback;
    });
    const blocked = createResolvable();

    void send(() => blocked.promise);
    clear();
    await send((emit) => emit("DONE"));

    expect(emitted).toEqual([["DONE"]]);
    blocked.resolve();
  });
});
