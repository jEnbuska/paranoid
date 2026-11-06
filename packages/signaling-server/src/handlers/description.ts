import { requireInviteContext } from "../invite-context.ts";
import type { HandleEncrypted } from "../types.ts";

export const handleDescription: HandleEncrypted<"DESCRIPTION"> = (
  socket,
  description,
) => {
  const { descriptionProvided, otherCalleeSocket, onDescriptionProvided } =
    requireInviteContext(socket);
  if (!otherCalleeSocket) return;
  if (descriptionProvided) return;
  socket.to(otherCalleeSocket).emit("DESCRIPTION", description);
  onDescriptionProvided();
};
