import { requireInviteContext } from "../invite-context.ts";
import type { HandleEncrypted } from "../types.ts";

export const handleCandidate: HandleEncrypted<"CANDIDATE"> = (
  socket,
  candidate,
) => {
  const { otherCalleeSocket, handshake } = requireInviteContext(socket);
  if (!otherCalleeSocket) return;
  // After the handshake, candidates go over the data channel
  if (handshake === "finished") return;
  socket.to(otherCalleeSocket).emit("CANDIDATE", candidate);
};
