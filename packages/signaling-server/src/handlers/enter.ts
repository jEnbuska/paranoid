import {
  updateInvite,
  getInviteBySocket,
  getInviteCalleeRole,
  getInviteById,
} from "../invites.ts";
import type { HandleNonEncrypted } from "../types.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export const handleEnter: HandleNonEncrypted<"ENTER"> = (
  socket,
  inviteId,
  ack,
) => {
  const pendingInvite = getInviteBySocket(socket.id);

  if (pendingInvite) {
    const calleeRole = getInviteCalleeRole(socket.id, pendingInvite);
    return ack({
      success: false,
      type:
        calleeRole === "offerer"
          ? "NON_CLOSED_OFFER_EXISTS"
          : "NON_CLOSED_INVITE_EXISTS",
    });
  }
  const invite = getInviteById(inviteId);
  if (!invite) {
    return ack({ success: false, type: "NOT_FOUND" });
  }
  const { expiresAt, offerer, publicKey, answerer } = invite;
  // Somebody has already entered the invite, so it's no longer available
  if (answerer.descriptionProvided || !invite.publicKey) {
    return ack({ success: false, type: "NOT_FOUND" });
  }

  assertIsNotNil(publicKey);
  ack({ success: true, expiresAt, publicKey });
  socket.to(offerer.socketId).emit("ENTER");
  updateInvite(invite.id, (state) => ({
    ...state,
    answerer: { ...state.answerer, socketId: socket.id },
    publicKey: undefined,
  }));
};
