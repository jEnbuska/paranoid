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
  candidatesProvided: boolean;
  descriptionProvided: boolean;
  otherCalleeSocket: string | undefined;
  otherCalleeDescriptionProvided: boolean;
  otherCalleeCandidatesProvided: boolean;
  onDescriptionProvided(): void;
  onCandidatesProvided(): void;
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
    candidatesProvided: calleeState.candidatesProvided,
    descriptionProvided: calleeState.descriptionProvided,
    otherCalleeSocket: otherState.socketId,
    otherCalleeDescriptionProvided: otherState.descriptionProvided,
    otherCalleeCandidatesProvided: otherState.candidatesProvided,
    onDescriptionProvided() {
      update((state) => ({
        ...state,
        [calleeRole]: { ...state[calleeRole], description: true },
      }));
    },
    onCandidatesProvided() {
      update((state) => ({
        ...state,
        [calleeRole]: { ...state[calleeRole], candidatesProvided: true },
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
