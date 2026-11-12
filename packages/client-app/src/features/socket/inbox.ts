import type { AppSocket } from "~/features/socket/types";
import { useSocket } from "~/features/socket/hooks.ts";
import type { ServerToClientEventType } from "shared-lib/types";
import { createQueuedTake } from "~/features/socket/queues/queued-take.ts";
import { createQueuedSend } from "~/features/socket/queues/queued-send.ts";

const HANDSHAKE_EVENTS: Array<ServerToClientEventType> = [
  "ENTER",
  "JOIN",
  "DESCRIPTION",
  "CANDIDATE",
  "DONE",
  "CLOSE",
] as const;
type HandshakeEvent = (typeof HANDSHAKE_EVENTS)[number];

function createInbox(socket: AppSocket) {
  const queues = new Map<HandshakeEvent, unknown[][]>();
  let clearSend = () => {};
  function onClear(cb: () => void) {
    clearSend = cb;
  }
  return {
    /** The oldest unread event of this type, or the next one to arrive */
    take: createQueuedTake(socket, queues),

    send: createQueuedSend(socket, onClear),

    /** Drops unread events, so nothing leaks into the next invite */
    clear() {
      queues.clear();
      clearSend();
    },
  };
}

const inboxes = new WeakMap<AppSocket, ReturnType<typeof createInbox>>();

export function getInbox(socket: AppSocket) {
  return inboxes.getOrInsertComputed(socket, createInbox);
}

export function useInbox() {
  const socket = useSocket();
  return getInbox(socket);
}
