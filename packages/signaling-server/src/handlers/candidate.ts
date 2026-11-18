import { requireInviteContext } from "../invite-context.ts";
import type { HandleEncrypted } from "../types.ts";

export const handleCandidate: HandleEncrypted<"CANDIDATE"> = (
  socket,
  candidate,
) => {
  const { otherCalleeSocket, handshakeFinished } = requireInviteContext(socket);
  if (!otherCalleeSocket) return;
  // After the handshake, candidates go over the data channel
  if (handshakeFinished) return;
  socket.to(otherCalleeSocket).emit("CANDIDATE", candidate);
};
