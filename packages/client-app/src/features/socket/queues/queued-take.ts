import type { AppSocket } from "~/features/socket/types.ts";
import type { ServerToClientEventType } from "shared-lib/types";

const HANDSHAKE_EVENTS: Array<ServerToClientEventType> = [
  "ENTER",
  "JOIN",
  "DESCRIPTION",
  "CANDIDATE",
  "DONE",
  "CLOSE",
] as const;
type HandshakeEvent = (typeof HANDSHAKE_EVENTS)[number];
type Waiter = (args: unknown[]) => void;
export function createQueuedTake(
  socket: AppSocket,
  queues: Map<HandshakeEvent, unknown[][]>,
) {
  const waiters = new Map<HandshakeEvent, Waiter[]>();
  for (const type of HANDSHAKE_EVENTS) {
    (socket.on as any)(type, (...args: unknown[]) => {
      const waiter = waiters.get(type)?.shift();
      if (waiter) return waiter(args);
      const queue = queues.getOrInsertComputed(type, () => []);
      if (queue.length < 100) queue.push(args); // Cap: only the peer can fill it
    });
  }

  return async function take(
    type: HandshakeEvent,
    signal: AbortSignal,
  ): Promise<unknown[]> {
    // Reads the queue a microtask later, so that a take whose signal aborts
    // right away leaves the event for the next take. React.StrictMode aborts
    // an effect's first run that way in development
    await Promise.resolve();
    signal.throwIfAborted();
    const queued = queues.get(type)?.shift();
    if (queued) return queued;
    return new Promise((resolve, reject) => {
      const list = waiters.getOrInsertComputed(type, () => []);
      const waiter: Waiter = (args) => {
        signal.removeEventListener("abort", onAbort);
        resolve(args);
      };
      const onAbort = () => {
        const index = list.indexOf(waiter);
        if (index !== -1) list.splice(index, 1);
        reject(signal.reason);
      };
      list.push(waiter);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  };
}
