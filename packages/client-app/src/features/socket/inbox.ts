import type { AppSocket } from "~/features/socket/types";
import { useSocket } from "~/features/socket/hooks.ts";
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

function createInbox(socket: AppSocket) {
  const queues = new Map<HandshakeEvent, unknown[][]>();
  const waiters = new Map<HandshakeEvent, Waiter[]>();
  for (const type of HANDSHAKE_EVENTS) {
    (socket.on as any)(type, (...args: unknown[]) => {
      const waiter = waiters.get(type)?.shift();
      if (waiter) return waiter(args);
      const queue = queues.get(type) ?? [];
      if (queue.length < 100) queue.push(args); // Cap: only the peer can fill it
      queues.set(type, queue);
    });
  }
  return {
    /** The oldest unread event of this type, or the next one to arrive */
    take(type: HandshakeEvent, signal: AbortSignal): Promise<unknown[]> {
      const queued = queues.get(type)?.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const list = waiters.get(type) ?? [];
        waiters.set(type, list);
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
    },
    /** Drops unread events, so nothing leaks into the next invite */
    clear() {
      queues.clear();
    },
  };
}

const inboxes = new WeakMap<AppSocket, ReturnType<typeof createInbox>>();

export function getInbox(socket: AppSocket) {
  let inbox = inboxes.get(socket);
  if (!inbox) inboxes.set(socket, (inbox = createInbox(socket)));
  return inbox;
}

export function useInbox() {
  const socket = useSocket();
  return getInbox(socket);
}
