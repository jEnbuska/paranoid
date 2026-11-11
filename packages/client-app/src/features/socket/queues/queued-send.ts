import type { AppSocket } from "~/features/socket/types.ts";

function ignore() {}

export function createQueuedSend(socket: AppSocket) {
  /** The last send queued, which the next one waits for. It never rejects */
  let promise: Promise<unknown> = Promise.resolve();
  const emit = socket.emit.bind(socket);

  /**
   * Runs `send` once every send queued earlier on this socket has finished,
   * so events leave in the order they were queued, however long each one takes
   * to prepare.
   *
   * Without it an event with nothing to encrypt, such as DONE, would overtake an
   * event that is still being encrypted, such as the DESCRIPTION queued before
   * it.
   *
   * A send that fails rejects the returned promise only. The sends queued after
   * it still run.
   */
  return function send<T>(
    send: (emit: AppSocket["emit"]) => T | Promise<T>,
  ): Promise<T> {
    const result = promise.then(() => send(emit));
    promise = result.catch(ignore);
    return result;
  };
}
