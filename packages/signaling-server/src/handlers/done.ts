import { requireInviteContext } from "../invite-context.ts";
import { removeInvite } from "../invites.ts";
import type { HandleNonEncrypted } from "../types.ts";

/**
 * This side has finished the handshake over the data channel, so it needs
 * nothing more from the server. Once both sides have, the invite is forgotten
 */
export const handleDone: HandleNonEncrypted<"DONE"> = (socket) => {
  const { inviteId, handshake, otherCalleeHandshake, setHandshake } =
    requireInviteContext(socket);
  // The handshake can't have finished without this side's description, and
  // a second DONE changes nothing
  if (handshake !== "described") return;
  setHandshake("finished");
  if (otherCalleeHandshake === "finished") removeInvite(inviteId);
};
