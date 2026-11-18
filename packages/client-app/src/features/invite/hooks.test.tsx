// @vitest-environment jsdom
import { Component, StrictMode, type PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import InviteCallbacksContext from "~/features/invite/context/InviteCallbacksContext";
import { defaultInviteContextState } from "~/features/invite/constants";
import type {
  InviteContextCallbacks,
  InviteContextStateData,
} from "~/features/invite/types";
import EstablishingOfferPeerConnectionStep from "~/pages/@components/EstablishingOfferPeerConnectionStep.tsx";
import EstablishingAnswerPeerConnection from "~/pages/join/[inviteId]/_components/EstablishingAnswerPeerConnection.tsx";
import { useInviteConnectionProgress } from "./hooks.ts";

/** What the signaling server is sent. Each test decides whether a send fails */
let emit: (type: string, ...args: unknown[]) => Promise<void>;

vi.mock("~/features/socket/hooks.ts", () => ({
  useEmitIntroduction: () => emit,
  // No events arrive from the peer in these tests
  useOnEventDecrypted: () => {},
}));

vi.mock("~/features/crypt/hooks.ts", () => ({
  useEncrypt: () => async (data: unknown) => JSON.stringify(data),
}));

vi.mock("~/features/invite/_components/InviteView.tsx", () => ({
  default: () => <p>Connecting</p>,
}));

/** Runs the pending microtasks and the state updates they cause */
const flush = () => act(() => new Promise((resolve) => setTimeout(resolve)));

/** Renders its children as they are, to compare with StrictMode */
function Plain({ children }: PropsWithChildren) {
  return <>{children}</>;
}

const modes = [
  { name: "in StrictMode", Wrapper: StrictMode },
  { name: "without StrictMode", Wrapper: Plain },
];

/** Shows the error it caught, as the app's error boundary would */
class ErrorBoundary extends Component<PropsWithChildren, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <p role="alert">{this.state.error.message}</p>;
    return this.props.children;
  }
}

/** A peer connection that has an offer, which the test dispatches events on */
function fakeConnection() {
  return Object.assign(new EventTarget(), {
    localDescription: { type: "offer", sdp: "" },
    remoteDescription: null,
    connectionState: "new",
    iceGatheringState: "gathering",
    iceConnectionState: "new",
    signalingState: "have-local-offer",
  }) as unknown as RTCPeerConnection;
}

/** A data channel whose `readyState` the test sets before dispatching */
function fakeChannel() {
  return Object.assign(new EventTarget(), {
    readyState: "connecting",
  }) as { readyState: RTCDataChannelState } & RTCDataChannel;
}

function iceCandidate(candidate: RTCIceCandidateInit | null) {
  return Object.assign(new Event("icecandidate"), { candidate });
}

function Providers({
  state,
  children,
}: PropsWithChildren<{ state: Partial<InviteContextStateData> }>) {
  const value = { ...defaultInviteContextState, ...state };
  const callbacks = {
    handshake: async () => {},
  } as unknown as InviteContextCallbacks;
  return (
    <MemoryRouter>
      <InviteStateContext
        value={{
          state: value,
          getState: () => value,
          updateState: async () => {},
        }}
      >
        <InviteCallbacksContext value={callbacks}>
          {children}
        </InviteCallbacksContext>
      </InviteStateContext>
    </MemoryRouter>
  );
}

beforeEach(() => {
  // React logs the errors an error boundary catches
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sides = [
  { side: "the inviter", Step: EstablishingOfferPeerConnectionStep },
  { side: "the person joining", Step: EstablishingAnswerPeerConnection },
];

describe.each(modes)("exchanging ICE candidates $name", ({ Wrapper }) => {
  describe.each(sides)("on $side's side", ({ Step }) => {
    let connection: RTCPeerConnection;
    const ui = () => (
      <Wrapper>
        <ErrorBoundary>
          <Providers state={{ connection }}>
            <Step />
          </Providers>
        </ErrorBoundary>
      </Wrapper>
    );

    beforeEach(() => {
      connection = fakeConnection();
      emit = async (type) => {
        if (type === "CANDIDATE") throw new Error(`Sending ${type} failed`);
      };
    });

    test("a failed CANDIDATE send reaches the error boundary", async () => {
      render(ui());
      await flush();
      expect(screen.getByText("Connecting")).toBeTruthy();

      connection.dispatchEvent(iceCandidate({ candidate: "candidate" }));
      await flush();
      expect(screen.getByRole("alert").textContent).toBe(
        "Sending CANDIDATE failed",
      );
    });

    test("sends each candidate once, and nothing at the end of gathering", async () => {
      const sent: string[] = [];
      emit = async (type) => {
        sent.push(type);
      };
      render(ui());
      await flush();

      connection.dispatchEvent(iceCandidate({ candidate: "candidate" }));
      connection.dispatchEvent(iceCandidate(null));
      await flush();
      expect(sent.filter((type) => type !== "DESCRIPTION")).toEqual([
        "CANDIDATE",
      ]);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});

describe.each(modes)("useInviteConnectionProgress $name", ({ Wrapper }) => {
  function DataChannelProgress() {
    const progress = useInviteConnectionProgress();
    const channel = progress.find((it) => it.type === "Data Channel");
    return <output>{channel?.value ?? "No data channel"}</output>;
  }
  const connection = fakeConnection();
  const ui = (channel?: RTCDataChannel) => (
    <Wrapper>
      <Providers state={{ connection, channel }}>
        <DataChannelProgress />
      </Providers>
    </Wrapper>
  );
  const shown = () => screen.getByRole("status").textContent;

  test("follows the data channel's state", async () => {
    const channel = fakeChannel();
    render(ui(channel));
    await flush();
    expect(shown()).toBe("No data channel");

    channel.readyState = "open";
    channel.dispatchEvent(new Event("open"));
    await flush();
    expect(shown()).toBe("open");
  });

  test("removes the data channel listeners when the channel changes", async () => {
    const first = fakeChannel();
    const second = fakeChannel();
    const { rerender } = render(ui(first));
    await flush();

    rerender(ui(second));
    await flush();
    first.readyState = "closed";
    first.dispatchEvent(new Event("close"));
    await flush();
    expect(shown()).toBe("No data channel");

    second.readyState = "open";
    second.dispatchEvent(new Event("open"));
    await flush();
    expect(shown()).toBe("open");
  });

  test("removes the data channel listeners on unmount", async () => {
    const channel = fakeChannel();
    const addEventListener = vi.spyOn(channel, "addEventListener");
    const { unmount } = render(ui(channel));
    await flush();

    unmount();
    const signals = addEventListener.mock.calls.map(
      ([, , options]) => (options as AddEventListenerOptions).signal,
    );
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
  });
});
