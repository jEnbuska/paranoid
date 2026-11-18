import type {
  ChannelMessage,
  ChannelMessageData,
  ChannelMessageType,
  Decrypt,
} from "./types.ts";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isOptional = (value: unknown, type: "string" | "number") =>
  value === undefined || value === null || typeof value === type;

/**
 * Whether the peer's data has the shape its type needs. The peer can send
 * anything, and data that doesn't match would crash whatever reads it
 */
const IS_VALID_DATA: Record<ChannelMessageType, (data: unknown) => boolean> = {
  DISPLAY_NAME: (data) => typeof data === "string",
  // `createdBy` isn't checked: the receiver marks every message the other's
  TEXT: (data) =>
    isObject(data) &&
    typeof data.id === "string" &&
    typeof data.data === "string" &&
    Number.isFinite(data.createdAt),
  // What `addIceCandidate` takes
  CANDIDATE: (data) =>
    isObject(data) &&
    typeof data.candidate === "string" &&
    isOptional(data.sdpMid, "string") &&
    isOptional(data.sdpMLineIndex, "number") &&
    isOptional(data.usernameFragment, "string"),
};

function isChannelMessageType(type: unknown): type is ChannelMessageType {
  return typeof type === "string" && Object.hasOwn(IS_VALID_DATA, type);
}

/** Cap per type: only the peer can fill it */
const MAX_QUEUED = 100;

type Waiter = (data: unknown) => void;

function createInbox(channel: RTCDataChannel, decrypt: Decrypt) {
  /** Aborted when the inbox is cleared. Removes the listeners */
  const controller = new AbortController();
  const { signal } = controller;
  const queues = new Map<ChannelMessageType, unknown[]>();
  const waiters = new Map<ChannelMessageType, Waiter[]>();
  /**
   * The last message to be delivered, which the next one waits for.
   * Decrypting is async, and without it a short message could overtake a
   * longer one that arrived before it. It never rejects
   */
  let delivered = Promise.resolve();

  function deliver(message: ChannelMessage | undefined) {
    if (signal.aborted) return;
    const type: unknown = message?.type;
    if (!isChannelMessageType(type)) return;
    const { data } = message!;
    if (!IS_VALID_DATA[type](data)) {
      // Never the content, which is the peer's
      console.error(`Dropped a data channel message with malformed ${type}`);
      return;
    }
    const waiter = waiters.get(type)?.shift();
    if (waiter) return waiter(data);
    let queue = queues.get(type);
    if (!queue) queues.set(type, (queue = []));
    if (queue.length < MAX_QUEUED) queue.push(data);
  }

  channel.addEventListener(
    "message",
    ({ data }: MessageEvent<string>) => {
      // Decrypting starts at once, and delivering waits its turn
      const decrypted = decrypt<ChannelMessage>(data).catch((error) => {
        console.error("Failed to decrypt a data channel message", error);
        return undefined;
      });
      delivered = delivered.then(() => decrypted).then(deliver);
    },
    { signal },
  );
  channel.addEventListener("close", clear, { signal });

  function clear() {
    controller.abort();
    queues.clear();
    waiters.clear();
  }

  return {
    /** Aborted when the inbox is cleared */
    signal,

    /**
     * The oldest unread message of this type, or the next one to arrive.
     * Rejects when `signal` aborts. After the inbox is cleared, it waits until
     * then.
     */
    take<T extends ChannelMessageType>(
      type: T,
      signal: AbortSignal,
    ): Promise<ChannelMessageData<T>> {
      if (signal.aborted) return Promise.reject(signal.reason);
      const queue = queues.get(type);
      if (queue?.length) return Promise.resolve(queue.shift() as any);
      return new Promise((resolve, reject) => {
        let list = waiters.get(type);
        if (!list) waiters.set(type, (list = []));
        const waiter: Waiter = (data) => {
          signal.removeEventListener("abort", onAbort);
          resolve(data as any);
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

    /**
     * Drops unread messages and removes the listener, so nothing leaks into
     * the next invite. Also runs when the channel closes
     */
    clear,
  };
}

export type ChannelInbox = ReturnType<typeof createInbox>;

const inboxes = new WeakMap<RTCDataChannel, ChannelInbox>();

/**
 * Starts reading the channel. Call it as soon as the channel is created, so
 * that nothing that arrives early is lost
 */
export function createChannelInbox(channel: RTCDataChannel, decrypt: Decrypt) {
  const inbox = createInbox(channel, decrypt);
  inboxes.set(channel, inbox);
  return inbox;
}

export function getChannelInbox(channel: RTCDataChannel) {
  const inbox = inboxes.get(channel);
  if (!inbox) throw new Error("Data channel has no inbox");
  return inbox;
}
