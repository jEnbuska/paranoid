import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GATHERING_WAIT_MS, getGatheredLocalDescription } from "./utils";

/** Just enough of a peer connection, with gathering under the test's control */
function fakeConnection(iceGatheringState: RTCIceGatheringState) {
  let sdp = "v=0\r\n";
  const connection = Object.assign(new EventTarget(), {
    iceGatheringState,
    get localDescription() {
      return { toJSON: () => ({ type: "offer", sdp }) };
    },
  });
  return {
    connection: connection as unknown as RTCPeerConnection,
    gather(candidate: string) {
      sdp += `a=candidate:${candidate}\r\n`;
    },
    complete() {
      connection.iceGatheringState = "complete";
      connection.dispatchEvent(new Event("icegatheringstatechange"));
    },
  };
}

describe("getGatheredLocalDescription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves right away when gathering is already complete", async () => {
    const { connection } = fakeConnection("complete");
    await expect(getGatheredLocalDescription(connection)).resolves.toEqual({
      type: "offer",
      sdp: "v=0\r\n",
    });
  });

  test("waits for gathering to complete, with the candidates", async () => {
    const fake = fakeConnection("gathering");
    const description = getGatheredLocalDescription(fake.connection);
    fake.gather("1 1 UDP 1 192.0.2.1 5000 typ host");
    await vi.advanceTimersByTimeAsync(10);
    fake.complete();
    await expect(description).resolves.toEqual({
      type: "offer",
      sdp: "v=0\r\na=candidate:1 1 UDP 1 192.0.2.1 5000 typ host\r\n",
    });
  });

  test("stops waiting after GATHERING_WAIT_MS, with what was gathered", async () => {
    const fake = fakeConnection("gathering");
    let resolved = false;
    const description = getGatheredLocalDescription(fake.connection).then(
      (value) => {
        resolved = true;
        return value;
      },
    );
    fake.gather("1 1 UDP 1 192.0.2.1 5000 typ host");
    await vi.advanceTimersByTimeAsync(GATHERING_WAIT_MS - 1);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(description).resolves.toEqual({
      type: "offer",
      sdp: "v=0\r\na=candidate:1 1 UDP 1 192.0.2.1 5000 typ host\r\n",
    });
  });

  test("fails when there is no local description", async () => {
    const connection = Object.assign(new EventTarget(), {
      iceGatheringState: "complete",
      localDescription: null,
    }) as unknown as RTCPeerConnection;
    await expect(getGatheredLocalDescription(connection)).rejects.toThrow(
      "No local description to send",
    );
  });
});
