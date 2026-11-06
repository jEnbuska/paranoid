import { prop } from "shared-lib/utils/prop";

import { InviteConnectionProgressState } from "~/features/invite/types";

export function getExpiresInSeconds(expiresAt: number) {
  return Math.floor(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
}

const rtf = new Intl.RelativeTimeFormat("en", { style: "long" });
export function formatExpiresIn(number: number) {
  const minutes = Math.floor(number / 60);
  if (minutes) {
    return `Invite expires within ${rtf
      .formatToParts(minutes + 1, "minute")
      .slice(1)
      .map(prop("value"))
      .join("")}`;
  }
  const seconds = number % 60;
  if (seconds) {
    return `Invite expires in ${rtf
      .formatToParts(seconds, "second")
      .slice(1)
      .map(prop("value"))
      .join("")}`;
  }
  return undefined;
}

export function getConnectionStateProgress(
  connection: RTCPeerConnection,
  state:
    | "connectionState"
    | "iceGatheringState"
    | "iceConnectionState"
    | "signalingState",
): InviteConnectionProgressState {
  switch (state) {
    case "connectionState":
      return {
        type: "Peer Connection",
        value: connection.connectionState,
      };
    case "iceGatheringState":
      return {
        type: "ICE Gathering State",
        value: connection.iceGatheringState,
      };
    case "iceConnectionState":
      return {
        type: "ICE Connection State",
        value: connection.iceConnectionState,
      };
    case "signalingState":
      return {
        type: "Signaling state",
        value: connection.signalingState,
      };
  }
}
