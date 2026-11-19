import {
  getInviteBySocket,
  hasInvitesLeft,
  limitInvites,
  removeInvite,
} from "../invites.ts";
import { parseMaxInvites } from "../max-invites.ts";
import { handleCreate } from "../handlers/create.ts";
import { handleEnter } from "../handlers/enter.ts";
import { handleJoin } from "../handlers/join.ts";
import { handleDescription } from "../handlers/description.ts";
import { handleDone } from "../handlers/done.ts";
import { handleClose } from "../handlers/close.ts";
import { handleDisconnect } from "../handlers/disconnect.ts";
import type { ServerSocket } from "../types.ts";

const ttl = 60_000;

function fakeSocket(id: string) {
  return {
    id,
    emit: () => {},
    to: () => ({ emit: () => {} }),
  } as unknown as ServerSocket;
}

type CreateAck = Parameters<Parameters<typeof handleCreate>[2]>[0];

/** Sends CREATE from a new socket and returns the socket and the ack */
function create(id: string) {
  const socket = fakeSocket(id);
  let response: CreateAck | undefined;
  handleCreate(socket, { ttl, publicKey: "key" }, (ack) => (response = ack));
  return { socket, response: response! };
}

function createInvite(id: string) {
  const { socket, response } = create(id);
  if (!response.success) throw new Error(`Refused: ${response.type}`);
  return { socket, inviteId: response.inviteId };
}

/** The answerer enters and joins the invite */
function enter(inviteId: string, id: string) {
  const socket = fakeSocket(id);
  handleEnter(socket, inviteId, () => {});
  handleJoin(socket, "answerer key");
  return socket;
}

let onLastInviteFinished: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  onLastInviteFinished = vi.fn();
});

afterEach(() => {
  // Forgets the invites the test left open, before the limit goes
  for (const id of ["a", "b", "c", "a answerer", "b answerer"]) {
    const invite = getInviteBySocket(id);
    if (invite) removeInvite(invite.id);
  }
  limitInvites();
  vi.useRealTimers();
});

describe("without a limit", () => {
  it("creates any number of invites and never reports finishing", () => {
    for (const id of ["a", "b", "c"]) {
      const { inviteId } = createInvite(id);
      removeInvite(inviteId);
    }

    expect(hasInvitesLeft()).toBe(true);
  });
});

describe("with a limit", () => {
  beforeEach(() => {
    limitInvites({ max: 2, onLastInviteFinished });
  });

  it("refuses to create an invite past the limit", () => {
    createInvite("a");
    createInvite("b");

    expect(create("c").response).toEqual({
      success: false,
      type: "INVITE_LIMIT_REACHED",
    });
    expect(getInviteBySocket("c")).toBeUndefined();
  });

  it("counts invites that have already finished", () => {
    removeInvite(createInvite("a").inviteId);
    createInvite("b");

    expect(create("c").response).toMatchObject({ success: false });
  });

  it("still lets someone enter an invite once the limit is reached", () => {
    createInvite("a");
    const { inviteId } = createInvite("b");
    const acks: unknown[] = [];

    handleEnter(fakeSocket("b answerer"), inviteId, (ack) => acks.push(ack));

    expect(acks).toEqual([expect.objectContaining({ success: true })]);
  });

  it("doesn't report finishing before the limit is reached", () => {
    const { inviteId } = createInvite("a");
    removeInvite(inviteId);

    expect(hasInvitesLeft()).toBe(true);
    expect(onLastInviteFinished).not.toHaveBeenCalled();
  });

  it("doesn't report finishing while an invite is still open", () => {
    const { inviteId } = createInvite("a");
    createInvite("b");

    removeInvite(inviteId);

    expect(onLastInviteFinished).not.toHaveBeenCalled();
  });

  describe("reports finishing once, after the last invite", () => {
    /** Creates both invites and finishes the first, so the second is last */
    function lastInvite() {
      removeInvite(createInvite("a").inviteId);
      return createInvite("b");
    }

    afterEach(() => {
      expect(onLastInviteFinished).toHaveBeenCalledOnce();
    });

    it("when its peers connect", () => {
      const { socket: offerer, inviteId } = lastInvite();
      const answerer = enter(inviteId, "b answerer");
      handleDescription(offerer, "offer");
      handleDescription(answerer, "answer");

      handleDone(offerer);
      expect(onLastInviteFinished).not.toHaveBeenCalled();
      handleDone(answerer);
    });

    it("when it expires", () => {
      lastInvite();

      vi.advanceTimersByTime(ttl - 1);
      expect(onLastInviteFinished).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
    });

    it("when it's closed", () => {
      const { socket } = lastInvite();

      handleClose(socket);
    });

    it("when the inviter disconnects", () => {
      const { socket } = lastInvite();

      handleDisconnect(socket);
    });

    it("when the answerer disconnects", () => {
      const { inviteId } = lastInvite();
      const answerer = enter(inviteId, "b answerer");

      handleDisconnect(answerer);
    });

    it("in whichever order the invites finish", () => {
      const first = createInvite("a");
      const second = createInvite("b");

      removeInvite(second.inviteId);
      expect(onLastInviteFinished).not.toHaveBeenCalled();
      removeInvite(first.inviteId);
    });
  });

  it("doesn't report again when a socket without an invite disconnects", () => {
    removeInvite(createInvite("a").inviteId);
    removeInvite(createInvite("b").inviteId);

    handleDisconnect(fakeSocket("c"));

    expect(onLastInviteFinished).toHaveBeenCalledOnce();
  });
});

describe("parseMaxInvites", () => {
  it("means no limit when MAX_INVITES isn't set or is empty", () => {
    expect(parseMaxInvites(undefined)).toBeUndefined();
    expect(parseMaxInvites("")).toBeUndefined();
  });

  it("reads a whole number of at least 1", () => {
    expect(parseMaxInvites("1")).toBe(1);
    expect(parseMaxInvites("250")).toBe(250);
  });

  it.each(["0", "-1", "1.5", "1e3", " 2", "two", "0x10", "99999999999999999"])(
    "rejects %j",
    (value) => {
      expect(() => parseMaxInvites(value)).toThrow(
        `Invalid MAX_INVITES: ${value}`,
      );
    },
  );
});
