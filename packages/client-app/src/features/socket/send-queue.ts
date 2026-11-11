/** The end of each socket's queue. A socket that replaces another starts with
 * an empty queue of its own */
const queues = new WeakMap<object, Promise<void>>();

/**
 * Runs `send` once every send queued earlier for the same socket has finished,
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
export function enqueueSend<T>(
  socket: object,
  send: () => T | Promise<T>,
): Promise<T> {
  const queue = queues.get(socket) ?? Promise.resolve();
  const result = queue.then(send);
  queues.set(
    socket,
    result.then(
      () => {},
      () => {},
    ),
  );
  return result;
}
