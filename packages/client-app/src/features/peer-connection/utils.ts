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
 * The longest a side waits for ICE gathering before sending its description.
 * Host candidates gather within milliseconds, but a STUN server that doesn't
 * answer keeps gathering going for seconds
 */
export const GATHERING_WAIT_MS = 500;

/**
 * The local description with the candidates gathered so far, once gathering
 * is complete or after `GATHERING_WAIT_MS`. Candidates in the description reach
 * the peer with it. Sent on their own through a slow signaling server, they can
 * arrive more than 5 seconds after the peer starts its checks, and Firefox then
 * fails ICE (its `media.peerconnection.ice.trickle_grace_period`). Candidates
 * gathered later still trickle (`useHandleInviteConnectionIceCandidatesExchange`)
 */
export async function getGatheredLocalDescription(
  connection: RTCPeerConnection,
): Promise<RTCSessionDescriptionInit> {
  if (connection.iceGatheringState !== "complete") {
    await new Promise<void>((resolve) => {
      const controller = new AbortController();
      const done = () => {
        controller.abort();
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(done, GATHERING_WAIT_MS);
      connection.addEventListener(
        "icegatheringstatechange",
        () => {
          if (connection.iceGatheringState === "complete") done();
        },
        { signal: controller.signal },
      );
    });
  }
  const description = connection.localDescription;
  if (!description) throw new Error("No local description to send");
  return description.toJSON();
}
