import { describe, expect, test } from "vitest";
import createResolvable from "shared-lib/utils/create-resolvable";
import { enqueueSend } from "./send-queue";

/** Lets every promise callback that is ready to run, run */
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("enqueueSend", () => {
  test("an instant send waits for a slower one queued before it", async () => {
    const socket = {};
    const sent: string[] = [];
    const encrypted = createResolvable();

    const description = enqueueSend(socket, async () => {
      await encrypted.promise;
      sent.push("DESCRIPTION");
    });
    const done = enqueueSend(socket, () => {
      sent.push("DONE");
    });

    await settle();
    expect(sent).toEqual([]);

    encrypted.resolve();
    await Promise.all([description, done]);
    expect(sent).toEqual(["DESCRIPTION", "DONE"]);
  });

  test("keeps the order of many sends that take different times", async () => {
    const socket = {};
    const sent: number[] = [];
    const delays = [15, 0, 10, 0, 5];

    await Promise.all(
      delays.map((delay, index) =>
        enqueueSend(socket, async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          sent.push(index);
        }),
      ),
    );

    expect(sent).toEqual([0, 1, 2, 3, 4]);
  });

  test("starts a send only when the one before it has finished", async () => {
    const socket = {};
    const first = createResolvable();
    let secondStarted = false;

    void enqueueSend(socket, () => first.promise);
    const second = enqueueSend(socket, () => {
      secondStarted = true;
    });

    await settle();
    expect(secondStarted).toBe(false);

    first.resolve();
    await second;
    expect(secondStarted).toBe(true);
  });

  test("resolves with what the send returns", async () => {
    const socket = {};
    await expect(enqueueSend(socket, () => "sync")).resolves.toBe("sync");
    await expect(enqueueSend(socket, async () => "async")).resolves.toBe(
      "async",
    );
  });

  test("a send that rejects fails alone, and the next one still runs", async () => {
    const socket = {};
    const failed = enqueueSend(socket, async () => {
      throw new Error("Encryption failed");
    });
    const next = enqueueSend(socket, () => "sent");

    await expect(failed).rejects.toThrow("Encryption failed");
    await expect(next).resolves.toBe("sent");
  });

  test("a send that throws fails alone, and the next one still runs", async () => {
    const socket = {};
    const failed = enqueueSend(socket, () => {
      throw new Error("Not connected");
    });
    const next = enqueueSend(socket, () => "sent");

    await expect(failed).rejects.toThrow("Not connected");
    await expect(next).resolves.toBe("sent");
  });

  test("sockets don't wait for each other", async () => {
    const blocked = createResolvable();
    const sent: string[] = [];

    void enqueueSend({}, () => blocked.promise);
    await enqueueSend({}, () => {
      sent.push("other socket");
    });

    expect(sent).toEqual(["other socket"]);
    blocked.resolve();
  });
});
