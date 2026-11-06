import { randomUUID } from "node:crypto";
import clamp from "shared-lib/utils/clamp";
import { propEquals, propNotEquals } from "shared-lib/utils/prop";

let invites: Array<InviteData> = [];

type InviteData = {
  id: string;
  expiresAt: number;
  ttl: number;
  publicKey?: string;
  _timeoutId?: NodeJS.Timeout;
  offerer: {
    socketId: string;
    descriptionProvided: boolean;
    candidatesProvided: boolean;
  };
  answerer: {
    socketId?: string;
    descriptionProvided: boolean;
    candidatesProvided: boolean;
  };
};

/** Creates an invitation, that will automatically be removed within 2 minutes.
 * When called existing invites from the same sockets will be removed */
export function createInvite(data: {
  socketId: string;
  ttl: number;
  publicKey: string;
  /** Called when the time runs out, with the socket of anyone who opened it */
  onExpired(answererSocketId?: string): void;
}): Readonly<InviteData> {
  const { socketId } = data;
  /** Don't allow user to have multiple invites open */
  if (getInviteBySocket(socketId)) {
    throw new Error("Invite already exists");
  }
  let { ttl, publicKey } = data;
  ttl = clamp({
    value: ttl,
    min: 20 * 1000 /* 20 seconds */,
    max: 20 * 60 * 1000 /* 20 minutes*/,
  });
  const inviteId = randomUUID();

  const _timeoutId = setTimeout(() => {
    const answererSocketId = getInviteById(inviteId)?.answerer.socketId;
    removeInvite(inviteId);
    data.onExpired(answererSocketId);
  }, ttl);

  const expiresAt = Date.now() + ttl;
  const invite: InviteData = {
    id: inviteId,
    ttl,
    _timeoutId,
    publicKey,
    expiresAt,
    offerer: {
      socketId,
      candidatesProvided: false,
      descriptionProvided: false,
    },
    answerer: {
      descriptionProvided: false,
      candidatesProvided: false,
    },
  };

  invites = [...invites, invite];
  return invite;
}

export function getInviteBySocket(
  socketId: string,
): Readonly<InviteData> | undefined {
  return invites.find(
    (invite) =>
      invite.offerer.socketId === socketId ||
      invite.answerer.socketId === socketId,
  );
}

export function getInviteById(
  inviteId: string,
): Readonly<InviteData> | undefined {
  return invites.find(propEquals("id", inviteId));
}

export function removeInvite(inviteId: string): void {
  const invite = invites.find(propEquals("id", inviteId));
  if (!invite) return;
  const { _timeoutId, id } = invite;
  if (_timeoutId) clearTimeout(_timeoutId);
  invites = invites.filter(propNotEquals("id", id));
}

export function updateInvite(
  inviteId: string,
  update: (data: Readonly<InviteData>) => InviteData,
): Readonly<InviteData> {
  const invite = getInviteById(inviteId);
  if (!invite) throw new Error(`Invite not found with id ${inviteId}`);
  const updatedInvite = { ...update(invite), id: inviteId };
  invites = invites.map((next) =>
    next.id === inviteId ? updatedInvite : next,
  );
  return updatedInvite;
}

export function getInviteCalleeRole(socketId: string, invite: InviteData) {
  return invite.offerer.socketId === socketId ? "offerer" : "answerer";
}

export function getInviteCounterPartSocket(
  socketId: string,
  invite: InviteData,
) {
  const callee = getInviteCalleeRole(socketId, invite);
  return invite[callee === "offerer" ? "answerer" : "offerer"].socketId;
}
