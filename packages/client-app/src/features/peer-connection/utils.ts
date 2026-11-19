import entries from "shared-lib/utils/entries";
import { parseIceServers } from "./ice-servers";

const iceServers = parseIceServers(import.meta.env.VITE_ICE_SERVERS);

export function createPeerConnection() {
  return new RTCPeerConnection({ iceServers });
}

export function addPeerConnectionEventListeners(
  connection: RTCPeerConnection,
  signal: AbortSignal | undefined,
  listeners: Partial<{
    [K in keyof RTCPeerConnectionEventMap]: (
      this: RTCPeerConnection,
      ev: RTCPeerConnectionEventMap[K],
    ) => any;
  }>,
) {
  entries(listeners).forEach(
    ([type, listener]: any) => {
      connection.addEventListener(
        type as keyof RTCPeerConnectionEventMap,
        listener,
        { signal },
      );
    },
    { signal },
  );
}

/**
 * Closes the data channel and the connection, which tells the peer at once.
 * Closing only the channel sends its close later, if at all
 */
export function closePeerConnection(
  connection: RTCPeerConnection | undefined,
  channel: RTCDataChannel | undefined,
) {
  channel?.close();
  connection?.close();
}
