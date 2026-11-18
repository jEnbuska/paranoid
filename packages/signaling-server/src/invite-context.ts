import {
  getInviteBySocket,
  getInviteCalleeRole,
  updateInvite,
} from "./invites.ts";
import curry from "shared-lib/utils/curry";
import type { ServerSocket } from "./types.ts";

type InviteContext = {
  inviteId: string;
  calleeRole: "offerer" | "answerer";
  handshakeFinished: boolean;
  descriptionProvided: boolean;
  otherCalleeSocket: string | undefined;
  otherCalleeDescriptionProvided: boolean;
  otherCalleeHandshakeFinished: boolean;
  onDescriptionProvided(): void;
  onHandshakeFinished(): void;
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
    handshakeFinished: calleeState.handshakeFinished,
    descriptionProvided: calleeState.descriptionProvided,
    otherCalleeSocket: otherState.socketId,
    otherCalleeDescriptionProvided: otherState.descriptionProvided,
    otherCalleeHandshakeFinished: otherState.handshakeFinished,
    onDescriptionProvided() {
      update((state) => ({
        ...state,
        [calleeRole]: { ...state[calleeRole], descriptionProvided: true },
      }));
    },
    onHandshakeFinished() {
      update((state) => ({
        ...state,
        [calleeRole]: { ...state[calleeRole], handshakeFinished: true },
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
