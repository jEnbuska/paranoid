import { InviteContextStateData } from "~/features/invite/types";

export const defaultInviteContextState: InviteContextStateData = {
  active: false,
  expiresAt: 0,
  stage: "none",
  displayName: "",
  publicKey: "",
  privateKey: "",
  peerPublicKey: "",
  peerPublicKeyEncrypted: "",
  password: "",
  userId: "",
  peerDisplayName: "",
  inviteId: "",
};

export const inviteConnectionStateTypes = [
  "connectionState",
  "iceGatheringState",
  "iceConnectionState",
  "signalingState",
] as const;

/**
 * How long connecting to the peer may take, from when both people are on the
 * invite until the handshake over the data channel has finished. Waiting for
 * someone to open the link doesn't count: the invite's expiry covers that
 */
export const CONNECTING_TIMEOUT_MS = 30_000;
