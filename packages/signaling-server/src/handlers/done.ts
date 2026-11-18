import { requireInviteContext } from "../invite-context.ts";
import { removeInvite } from "../invites.ts";
import type { HandleNonEncrypted } from "../types.ts";

/**
 * This side has finished the handshake over the data channel, so it needs
 * nothing more from the server. Once both sides have, the invite is forgotten
 */
export const handleDone: HandleNonEncrypted<"DONE"> = (socket) => {
  const {
    inviteId,
    descriptionProvided,
    handshakeFinished,
    otherCalleeHandshakeFinished,
    onHandshakeFinished,
  } = requireInviteContext(socket);
  // The handshake can't have finished without this side's description, and
  // the other side's DONE implies its own
  if (!descriptionProvided || handshakeFinished) return;
  onHandshakeFinished();
  if (otherCalleeHandshakeFinished) removeInvite(inviteId);
};
