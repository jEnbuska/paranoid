import { requireInviteContext } from "../invite-context.ts";
import { removeInvite } from "../invites.ts";
import type { HandleNonEncrypted } from "../types.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export const handleDone: HandleNonEncrypted<"DONE"> = (socket) => {
  const {
    inviteId,
    descriptionProvided,
    otherCalleeCandidatesProvided,
    otherCalleeSocket,
    onCandidatesProvided,
  } = requireInviteContext(socket);
  if (descriptionProvided) return;
  onCandidatesProvided();
  if (!otherCalleeCandidatesProvided) return;
  removeInvite(inviteId);
  assertIsNotNil(otherCalleeSocket);
  socket.to(otherCalleeSocket).emit("DONE");
  socket.emit("DONE");
};
