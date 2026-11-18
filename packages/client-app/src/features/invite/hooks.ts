import { useReducer, useMemo, use } from "react";
import { useNavigate } from "react-router";
import {
  useOnEventDecrypted,
  useEmitIntroduction,
} from "~/features/socket/hooks";
import { useAbortController } from "~/hooks/use-abort-controller";
import { assertIsNotNil } from "shared-lib/utils/nil";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils";
import { useMemoOnce } from "~/hooks/use-memo-once";
import constList from "shared-lib/utils/const-list";
import { InviteConnectionProgressState } from "~/features/invite/types";
import { inviteConnectionStateTypes } from "~/features/invite/constants";
import { getConnectionStateProgress } from "~/features/invite/utils";
import sleep from "shared-lib/utils/sleep";
import { useEncrypt } from "~/features/crypt/hooks";
import { getChannelInbox } from "~/features/channel/inbox.ts";
import { sendChannelMessage } from "~/features/channel/send.ts";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import InviteCallbacksContext from "~/features/invite/context/InviteCallbacksContext";
import { useResolvable } from "~/hooks/use-resolvable";
import useReject from "~/hooks/use-reject.ts";

export function useInviteState() {
  return use(InviteStateContext).state;
}
export function useInviteCallbacks() {
  return use(InviteCallbacksContext);
}

export function useHandleInviteConnectionIceCandidatesExchange() {
  const emit = useEmitIntroduction();
  // The sends happen in a peer connection listener, outside the effect's
  // promise, so useAbortableEffect doesn't see their errors
  const reject = useReject();
  const { connection, channel } = useInviteState();
  assertIsNotNil(connection);
  useAbortableEffect(
    (signal) =>
      addPeerConnectionEventListeners(connection, signal, {
        icecandidate({ candidate }) {
          // The end of gathering (`null`) doesn't matter: the move to the chat
          // waits for the handshake only (`useMoveToChatAfterHandshake`)
          if (!candidate) return;
          // Once the channel is open, candidates go over it instead
          // (`exchangeCandidatesOverChannel`)
          if (channel?.readyState === "open") return;
          void emit("CANDIDATE", candidate).catch(reject);
        },
      }),
    [],
  );
  useOnEventDecrypted({
    type: "CANDIDATE",
    async callback(candidate) {
      while (!connection.remoteDescription) await sleep(100);
      return connection.addIceCandidate(candidate);
    },
  });
}

export function useInviteConnectionProgress() {
  const { connection, channel } = useInviteState();
  assertIsNotNil(connection);
  const initialState = useMemo(
    () =>
      inviteConnectionStateTypes.map((state) =>
        getConnectionStateProgress(connection, state),
      ),
    [],
  );
  const [progress, dispatchProgress] = useReducer(
    (
      prevState: InviteConnectionProgressState[],
      next: InviteConnectionProgressState,
    ) => prevState.filter((it) => it.type !== next.type).concat(next),
    initialState,
  );
  const addConnectionProgress = (
    connectionState: (typeof inviteConnectionStateTypes)[number],
    error?: string,
  ) => {
    dispatchProgress({
      ...getConnectionStateProgress(connection, connectionState),
      error,
    });
  };

  const { signal } = useAbortController();
  useMemoOnce(() => {
    addPeerConnectionEventListeners(connection, signal, {
      signalingstatechange: () => addConnectionProgress("signalingState"),
      connectionstatechange: () => addConnectionProgress("connectionState"),
      icegatheringstatechange: () => addConnectionProgress("iceGatheringState"),
      icecandidateerror: (e) =>
        addConnectionProgress("iceGatheringState", (e as any)?.errorText),
      iceconnectionstatechange: () =>
        addConnectionProgress("iceConnectionState"),
    });
  });
  // The effect's signal, so a replaced channel's listeners are removed
  useAbortableEffect(
    (signal) => {
      if (!channel) return;
      const type = "Data Channel" as const;
      constList(
        "open",
        "close",
        "closing",
        "error",
        "bufferedamountlow",
      ).forEach((event) => {
        channel.addEventListener(
          event,
          () =>
            dispatchProgress({
              type,
              value: channel.readyState,
            }),
          { signal },
        );
      });
    },
    [channel],
  );
  return progress;
}

/**
 * Creates the inviter's offer and sends it to the peer, only once per
 * connection: a connection with a local description has already sent its offer
 */
export function useSendOffer() {
  const { connection } = useInviteState();
  const emit = useEmitIntroduction();
  useAbortableEffect(async () => {
    assertIsNotNil(connection);
    if (connection.localDescription) return;
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await emit("DESCRIPTION", offer);
  }, []);
}

/**
 * Moves to the chat once the handshake over the data channel has finished,
 * however long ICE gathering goes on: the peers need nothing more from the
 * signaling server. Then tells the server, which forgets the invite once both
 * sides have told it
 */
export function useMoveToChatAfterHandshake() {
  const handshake = useHandleHandshake();
  const emit = useEmitIntroduction();
  const navigate = useNavigate();
  useAbortableEffect(async (signal) => {
    await handshake;
    if (signal.aborted) return;
    // The chat doesn't depend on the server, so a failed send doesn't stop it.
    // The invite then expires on its own
    void emit("DONE").catch(() => {});
    navigate("/chat", { replace: true });
  }, []);
}

function useHandleHandshake() {
  const { channel, connection, displayName } = useInviteState();
  const { handshake } = useInviteCallbacks();
  const encrypt = useEncrypt();
  const resolvable = useResolvable();
  useAbortableEffect((signal) => {
    assertIsNotNil(connection);
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange() {
        if (connection.connectionState !== "failed") return;
        resolvable.reject(new Error("Peer connection failed"));
      },
    });
  }, []);
  // Its own signal per run, so React.StrictMode's discarded first run neither
  // sends the display name nor takes the peer's name
  useAbortableEffect(
    async (signal) => {
      if (!channel) return;
      const options = { once: true, signal };
      channel.addEventListener(
        "close",
        () =>
          resolvable.reject(new Error("Data channel closed during handshake")),
        options,
      );
      try {
        if (channel.readyState !== "open") {
          await new Promise<void>((resolve, reject) => {
            channel.addEventListener("open", () => resolve(), options);
            channel.addEventListener(
              "error",
              () => reject(new Error("Data channel failed")),
              options,
            );
          });
        }
        signal.throwIfAborted();
        await sendChannelMessage(
          channel,
          { type: "DISPLAY_NAME", data: displayName },
          encrypt,
        );
        // The inbox keeps the peer's name if it arrived before this
        await handshake(
          await getChannelInbox(channel).take("DISPLAY_NAME", signal),
        );
        resolvable.resolve();
      } catch (e) {
        if (!signal.aborted) resolvable.reject(e);
      }
    },
    [channel],
  );
  return resolvable.promise;
}
