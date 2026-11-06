import {
  createInvite,
  getInviteById,
  removeInvite,
  updateInvite,
} from "../invites.ts";

const ttl = 60_000;

describe("createInvite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes the invite and reports it when the time runs out", () => {
    const onExpired = vi.fn();
    const invite = createInvite({
      socketId: "offerer",
      ttl,
      publicKey: "key",
      onExpired,
    });
    updateInvite(invite.id, (data) => ({
      ...data,
      answerer: { ...data.answerer, socketId: "answerer" },
    }));

    vi.advanceTimersByTime(ttl - 1);
    expect(onExpired).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpired).toHaveBeenCalledExactlyOnceWith("answerer");
    expect(getInviteById(invite.id)).toBeUndefined();
  });

  it("doesn't report an invite that was already removed", () => {
    const onExpired = vi.fn();
    const invite = createInvite({
      socketId: "offerer",
      ttl,
      publicKey: "key",
      onExpired,
    });

    removeInvite(invite.id);
    vi.advanceTimersByTime(ttl);

    expect(onExpired).not.toHaveBeenCalled();
  });
});
