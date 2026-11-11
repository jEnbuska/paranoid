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

  return {
    /** The oldest unread event of this type, or the next one to arrive */
    take: createQueuedTake(socket, queues),

    send: createQueuedSend(socket),

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
