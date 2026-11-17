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
