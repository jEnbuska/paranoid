import { removeInvite } from "../invites.ts";
import { requireInviteContext } from "../invite-context.ts";
import type { HandleNonEncrypted } from "../types.ts";

export const handleClose: HandleNonEncrypted<"CLOSE"> = (socket) => {
  const { inviteId, otherCalleeSocket } = requireInviteContext(socket);
  removeInvite(inviteId);
  if (!otherCalleeSocket) return;
  socket.to(otherCalleeSocket).emit("CLOSE");
};
