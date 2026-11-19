import {
  getInviteBySocket,
  getInviteCounterPartSocket,
  removeInvite,
} from "../invites.ts";
import type { ServerSocket } from "../types.ts";

/** The invite ends when either side's socket disconnects */
export function handleDisconnect(socket: ServerSocket) {
  const invite = getInviteBySocket(socket.id);
  if (!invite) return;
  const counterPartSocket = getInviteCounterPartSocket(socket.id, invite);
  removeInvite(invite.id);
  if (!counterPartSocket) return;
  socket.to(counterPartSocket).emit("CLOSE");
}
