import { requireInviteContext } from "../invite-context.ts";
import type { HandleEncrypted } from "../types.ts";

export const handleCandidate: HandleEncrypted<"CANDIDATE"> = (
  socket,
  candidate,
) => {
  const { otherCalleeSocket, descriptionProvided } =
    requireInviteContext(socket);
  if (!otherCalleeSocket) return;
  if (descriptionProvided) return;
  socket.to(otherCalleeSocket).emit("CANDIDATE", candidate);
};
