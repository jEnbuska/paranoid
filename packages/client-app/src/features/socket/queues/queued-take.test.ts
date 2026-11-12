import { describe, expect, test } from "vitest";
import type { AppSocket } from "~/features/socket/types";
import { createQueuedTake } from "./queued-take";

/** A socket whose events the test triggers with `receive` */
function fakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: (type: string, handler: (...args: unknown[]) => void) => {
      handlers.set(type, handler);
    },
  } as unknown as AppSocket;
  return {
    socket,
    receive: (type: string, ...args: unknown[]) =>
      handlers.get(type)?.(...args),
  };
}

const neverAborted = new AbortController().signal;

// The browsers the app supports have it, Node.js 24 doesn't yet
Map.prototype.getOrInsertComputed ??= function <K, V>(
  this: Map<K, V>,
  key: K,
  callback: (key: K) => V,
) {
  if (!this.has(key)) this.set(key, callback(key));
  return this.get(key) as V;
};

describe("createQueuedTake", () => {
  test("takes an event that arrived before the take", async () => {
    const { socket, receive } = fakeSocket();
    const take = createQueuedTake(socket, new Map());

    receive("DESCRIPTION", "first");
    receive("DESCRIPTION", "second");

    await expect(take("DESCRIPTION", neverAborted)).resolves.toEqual(["first"]);
    await expect(take("DESCRIPTION", neverAborted)).resolves.toEqual([
      "second",
    ]);
  });

  test("waits for an event that arrives after the take", async () => {
    const { socket, receive } = fakeSocket();
    const take = createQueuedTake(socket, new Map());

    const taken = take("DONE", neverAborted);
    await Promise.resolve();
    receive("DONE");

    await expect(taken).resolves.toEqual([]);
  });

  test("a take aborted right away leaves a queued event for the next take", async () => {
    // As React.StrictMode does with an effect's first run in development
    const { socket, receive } = fakeSocket();
    const take = createQueuedTake(socket, new Map());
    receive("DESCRIPTION", "description");

    const controller = new AbortController();
    const aborted = take("DESCRIPTION", controller.signal);
    controller.abort();
    const next = take("DESCRIPTION", neverAborted);

    await expect(aborted).rejects.toThrow();
    await expect(next).resolves.toEqual(["description"]);
  });

  test("a waiting take that aborts leaves the next event for the next take", async () => {
    const { socket, receive } = fakeSocket();
    const take = createQueuedTake(socket, new Map());

    const controller = new AbortController();
    const aborted = take("CANDIDATE", controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(aborted).rejects.toThrow();

    receive("CANDIDATE", "candidate");
    await expect(take("CANDIDATE", neverAborted)).resolves.toEqual([
      "candidate",
    ]);
  });
});
