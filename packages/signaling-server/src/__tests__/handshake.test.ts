import { createInvite, getInviteById, removeInvite } from "../invites.ts";
import { handleEnter } from "../handlers/enter.ts";
import { handleJoin } from "../handlers/join.ts";
import { handleDescription } from "../handlers/description.ts";
import { handleCandidate } from "../handlers/candidate.ts";
import { handleDone } from "../handlers/done.ts";
import type { ServerSocket } from "../types.ts";

/** What the sockets sent, as [to, event, ...args] */
let relayed: unknown[][];

function fakeSocket(id: string) {
  return {
    id,
    emit: (...args: unknown[]) => relayed.push([id, ...args]),
    to: (to: string) => ({
      emit: (...args: unknown[]) => relayed.push([to, ...args]),
    }),
  } as unknown as ServerSocket;
}

let inviteId: string;
const offerer = fakeSocket("offerer");
const answerer = fakeSocket("answerer");

/** Both sides are in the invite, and nothing has been relayed yet */
beforeEach(() => {
  relayed = [];
  inviteId = createInvite({
    socketId: offerer.id,
    ttl: 60_000,
    publicKey: "key",
    onExpired() {},
  }).id;
  handleEnter(answerer, inviteId, () => {});
  handleJoin(answerer, "answerer key");
  relayed = [];
});

afterEach(() => removeInvite(inviteId));

describe("the handshake through the signaling server", () => {
  it("relays one description from each side", () => {
    handleDescription(offerer, "offer");
    handleDescription(offerer, "second offer");
    handleDescription(answerer, "answer");
    handleDescription(answerer, "second answer");

    expect(relayed).toEqual([
      ["answerer", "DESCRIPTION", "offer"],
      ["offerer", "DESCRIPTION", "answer"],
    ]);
  });

  it("relays candidates sent after the descriptions", () => {
    handleDescription(offerer, "offer");
    handleCandidate(offerer, "offerer candidate");
    handleDescription(answerer, "answer");
    handleCandidate(answerer, "answerer candidate");
    handleCandidate(offerer, "later offerer candidate");

    expect(relayed.filter(([, event]) => event === "CANDIDATE")).toEqual([
      ["answerer", "CANDIDATE", "offerer candidate"],
      ["offerer", "CANDIDATE", "answerer candidate"],
      ["answerer", "CANDIDATE", "later offerer candidate"],
    ]);
  });

  it("keeps the invite until both sides have finished the handshake", () => {
    handleDescription(offerer, "offer");
    handleDescription(answerer, "answer");

    handleDone(offerer);
    expect(getInviteById(inviteId)).toBeDefined();

    handleDone(answerer);
    expect(getInviteById(inviteId)).toBeUndefined();
  });

  it("sends nothing to either side when they finish", () => {
    handleDescription(offerer, "offer");
    handleDescription(answerer, "answer");
    relayed = [];

    handleDone(offerer);
    handleDone(answerer);

    expect(relayed).toEqual([]);
  });

  it("keeps the invite when a side finishes before its description is relayed", () => {
    handleDescription(offerer, "offer");

    handleDone(answerer);
    handleDone(offerer);
    expect(getInviteById(inviteId)).toBeDefined();

    handleDescription(answerer, "answer");
    handleDone(answerer);
    expect(getInviteById(inviteId)).toBeUndefined();
  });

  it("keeps the invite when one side sends DONE twice", () => {
    handleDescription(offerer, "offer");
    handleDescription(answerer, "answer");

    handleDone(offerer);
    handleDone(offerer);

    expect(getInviteById(inviteId)).toBeDefined();
  });

  it("stops relaying a side's candidates once it has finished", () => {
    handleDescription(offerer, "offer");
    handleDescription(answerer, "answer");
    handleDone(offerer);
    relayed = [];

    handleCandidate(offerer, "offerer candidate");
    handleCandidate(answerer, "answerer candidate");

    expect(relayed).toEqual([["offerer", "CANDIDATE", "answerer candidate"]]);
  });
});
