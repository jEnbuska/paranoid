import {
  getInviteBySocket,
  getInviteCalleeRole,
  updateInvite,
} from "./invites.ts";
import type { HandshakeStep } from "./invites.ts";
import curry from "shared-lib/utils/curry";
import type { ServerSocket } from "./types.ts";

type InviteContext = {
  inviteId: string;
  calleeRole: "offerer" | "answerer";
  handshake: HandshakeStep;
  otherCalleeSocket: string | undefined;
  otherCalleeHandshake: HandshakeStep;
  setHandshake(step: HandshakeStep): void;
  onInviteJoined(): void;
};

/** Returns the context of the invite the socket belongs to.
 * Throws when there is no such invite */
export function requireInviteContext(socket: ServerSocket): InviteContext {
  const invite = getInviteBySocket(socket.id);

  if (!invite) {
    throw new Error("Invite not found");
  }
  const calleeRole = getInviteCalleeRole(socket.id, invite);
  const otherCalleeRole = calleeRole === "offerer" ? "answerer" : "offerer";
  const calleeState = invite[calleeRole];
  const otherState = invite[otherCalleeRole];
  // Create curry util function
  const update = curry(updateInvite, invite.id);

  return {
    inviteId: invite.id,
    calleeRole,
    handshake: calleeState.handshake,
    otherCalleeSocket: otherState.socketId,
    otherCalleeHandshake: otherState.handshake,
    setHandshake(handshake) {
      update((state) => ({
        ...state,
        [calleeRole]: { ...state[calleeRole], handshake },
      }));
    },
    onInviteJoined() {
      if (calleeRole === "offerer") {
        throw new Error("Callee cannot be the answerer");
      }
      update((state) => ({
        ...state,
        answerer: { ...state.answerer, socketId: socket.id },
      }));
    },
  };
}
