import { randomUUID } from "node:crypto";
import clamp from "shared-lib/utils/clamp";
import { propEquals, propNotEquals } from "shared-lib/utils/prop";

let invites: Array<InviteData> = [];

/** Set by `limitInvites`. Only a count: nothing about who created which invite */
let limit:
  | { max: number; created: number; onLastInviteFinished(): void }
  | undefined;

/**
 * Allows only `max` invites to be created, and calls `onLastInviteFinished`
 * once the last of them has been removed. Without options there's no limit
 */
export function limitInvites(options?: {
  max: number;
  onLastInviteFinished(): void;
}): void {
  limit = options && { ...options, created: 0 };
}

export function hasInvitesLeft(): boolean {
  return !limit || limit.created < limit.max;
}

/**
 * How far a side has got with the handshake through the server:
 * - `waiting`: hasn't sent its description
 * - `described`: its description has been relayed to the other side
 * - `finished`: sent DONE, so it finished the handshake over the data channel
 */
export type HandshakeStep = "waiting" | "described" | "finished";

type InviteData = {
  id: string;
  expiresAt: number;
  ttl: number;
  publicKey?: string;
  _timeoutId?: NodeJS.Timeout;
  offerer: {
    socketId: string;
    handshake: HandshakeStep;
  };
  answerer: {
    socketId?: string;
    handshake: HandshakeStep;
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
  if (!hasInvitesLeft()) throw new Error("Invite limit reached");
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
      handshake: "waiting",
    },
    answerer: {
      handshake: "waiting",
    },
  };

  invites = [...invites, invite];
  if (limit) limit.created++;
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

/** Every way an invite ends comes through here: its peers connected, it
 * expired, it was closed or one of its sockets disconnected */
export function removeInvite(inviteId: string): void {
  const invite = invites.find(propEquals("id", inviteId));
  if (!invite) return;
  const { _timeoutId, id } = invite;
  if (_timeoutId) clearTimeout(_timeoutId);
  invites = invites.filter(propNotEquals("id", id));
  // No invite can be created any more, so this is reached only once
  if (limit && !hasInvitesLeft() && !invites.length) {
    limit.onLastInviteFinished();
  }
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
