import {
  createInvite,
  getInviteBySocket,
  getInviteCalleeRole,
} from "../invites.ts";

import type { HandleNonEncrypted } from "../types.ts";

export const handleCreate: HandleNonEncrypted<"CREATE"> = (
  socket,
  { ttl, publicKey },
  ack,
) => {
  const invite = getInviteBySocket(socket.id);
  if (invite) {
    const calleeRole = getInviteCalleeRole(socket.id, invite);
    return ack({
      success: false,
      type: calleeRole ? "NON_CLOSED_INVITE_EXISTS" : "NON_CLOSED_OFFER_EXISTS",
    });
  }
  const { id: inviteId, expiresAt } = createInvite({
    socketId: socket.id,
    ttl,
    publicKey,
    onExpired(answererSocketId) {
      socket.emit("CLOSE");
      if (answererSocketId) socket.to(answererSocketId).emit("CLOSE");
    },
  });
  ack({ success: true, inviteId, expiresAt });
};
