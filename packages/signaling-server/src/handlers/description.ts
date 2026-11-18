import { requireInviteContext } from "../invite-context.ts";
import type { HandleEncrypted } from "../types.ts";

export const handleDescription: HandleEncrypted<"DESCRIPTION"> = (
  socket,
  description,
) => {
  const { handshake, otherCalleeSocket, setHandshake } =
    requireInviteContext(socket);
  if (!otherCalleeSocket) return;
  if (handshake !== "waiting") return;
  socket.to(otherCalleeSocket).emit("DESCRIPTION", description);
  setHandshake("described");
};
