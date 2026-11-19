import { useState } from "react";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useReject from "~/hooks/use-reject.ts";
import { PeerConnectionError } from "./PeerConnectionError.ts";
import {
  addPeerConnectionEventListeners,
  closePeerConnection,
} from "./utils.ts";

const isConnected = (connection: RTCPeerConnection, channel: RTCDataChannel) =>
  connection.connectionState === "connected" && channel.readyState === "open";

const isLost = (connection: RTCPeerConnection, channel: RTCDataChannel) =>
  connection.connectionState === "failed" ||
  connection.connectionState === "closed" ||
  channel.readyState === "closing" ||
  channel.readyState === "closed";

/**
 * Whether the connection to the peer works normally: `connected`, with the
 * data channel open. Any other state short of failing can still recover by
 * itself, for example `disconnected` after a short drop, and then `connecting`
 * on the way back in some browsers.
 *
 * A connection that fails or a channel that closes is gone for good, as there
 * is no server to reconnect through. This then closes both and sends a
 * `PeerConnectionError` to the error page. Both count: a peer that disappears
 * without closing, for example when its tab crashes or its close is lost,
 * never closes the channel in Chromium, and the connection fails instead
 */
export function useIsPeerConnected(
  connection: RTCPeerConnection,
  channel: RTCDataChannel,
) {
  // Listeners call it outside the effect's promise
  const reject = useReject();
  const [connected, setConnected] = useState(() =>
    isConnected(connection, channel),
  );
  useAbortableEffect(
    (signal) => {
      const update = () => {
        if (isLost(connection, channel)) {
          closePeerConnection(connection, channel);
          reject(new PeerConnectionError("lost"));
          return;
        }
        setConnected(isConnected(connection, channel));
      };
      addPeerConnectionEventListeners(connection, signal, {
        connectionstatechange: update,
      });
      channel.addEventListener("close", update, { signal });
      // It may have changed before the listeners were added
      update();
    },
    [connection, channel],
  );
  return connected;
}
