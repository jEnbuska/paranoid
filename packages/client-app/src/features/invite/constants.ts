import { InviteContextStateData } from "~/features/invite/types";

export const defaultInviteContextState: InviteContextStateData = {
  active: false,
  expiresAt: 0,
  stage: "none",
  userName: "",
  publicKey: "",
  privateKey: "",
  peerPublicKey: "",
  peerPublicKeyEncrypted: "",
  password: "",
  userId: "",
  peerName: "",
  inviteId: "",
};

export const inviteConnectionStateTypes = [
  "connectionState",
  "iceGatheringState",
  "iceConnectionState",
  "signalingState",
] as const;
