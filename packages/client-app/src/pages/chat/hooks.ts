import { useState } from "react";
import { useInviteState } from "~/features/invite/hooks";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useReject from "~/hooks/use-reject.ts";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils";
import { assertIsNotNil } from "shared-lib/utils/nil";

/**
 * Whether the chat's connection is `connected` with the channel open. Throws
 * to the error page when it's lost, and closes the channel on leaving the chat
 */
export function useChatConnection() {
  const { channel, connection } = useInviteState();
  assertIsNotNil(channel);
  assertIsNotNil(connection);
  const reject = useReject();
  const [connected, setConnected] = useState(true);
  useAbortableEffect((signal) => {
    const update = () => {
      // Chromium doesn't close the channel when the peer's page goes away
      // without closing it. The connection fails instead
      if (
        connection.connectionState === "failed" ||
        channel.readyState === "closed"
      ) {
        reject(new Error("Connection to peer lost"));
      }
      // Anything else, like `disconnected`, can still recover by itself
      setConnected(
        connection.connectionState === "connected" &&
          channel.readyState === "open",
      );
    };
    channel.addEventListener("close", update, { signal });
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange: update,
    });
    update();
    signal.addEventListener("abort", () => channel.close());
  }, []);
  return connected;
}
