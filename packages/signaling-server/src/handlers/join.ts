import { requireInviteContext } from "../invite-context.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";
import type { HandleEncrypted } from "../types.ts";

export const handleJoin: HandleEncrypted<"JOIN"> = (socket, passPhrase) => {
  const { calleeRole, onInviteJoined, otherCalleeSocket } =
    requireInviteContext(socket);
  if (calleeRole === "offerer") return;
  assertIsNotNil(otherCalleeSocket, "Other callee socket id is not defined");
  socket.to(otherCalleeSocket).emit("JOIN", passPhrase);
  onInviteJoined();
};
