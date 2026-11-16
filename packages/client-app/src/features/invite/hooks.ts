import { useReducer, useMemo, use } from "react";
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

export function useInviteState() {
  return use(InviteStateContext).state;
}
export function useInviteCallbacks() {
  return use(InviteCallbacksContext);
}

export function useHandleInviteConnectionIceCandidatesExchange(
  onError?: (error: unknown) => void,
) {
  const emit = useEmitIntroduction();
  const { signal } = useAbortController();
  const { connection, channel } = useInviteState();
  assertIsNotNil(connection);
  useAbortableEffect(
    () =>
      addPeerConnectionEventListeners(connection, signal, {
        icecandidate({ candidate }) {
          if (!candidate) {
            void emit("DONE").catch(onError);
          } else if (channel?.readyState !== "open") {
            // Once the channel is open, candidates go over it instead
            // (`exchangeCandidatesOverChannel`)
            void emit("CANDIDATE", candidate).catch(onError);
          }
        },
      }),
    [],
  );
  useOnEventDecrypted({
    type: "CANDIDATE",
    onError,
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
  useAbortableEffect(() => {
    if (!channel) return;
    const type = "Data Channel" as const;
    constList("open", "close", "closing", "error", "bufferedamountlow").forEach(
      (event) => {
        channel.addEventListener(
          event,
          () =>
            dispatchProgress({
              type,
              value: channel.readyState,
            }),
          { signal },
        );
      },
    );
  }, [channel]);
  return progress;
}

export function useHandleHandshake() {
  const { channel, connection, userName } = useInviteState();
  const { signal } = useAbortController();
  const { handshake } = useInviteCallbacks();
  const encrypt = useEncrypt();
  const resolvable = useResolvable();
  useAbortableEffect(() => {
    assertIsNotNil(connection);
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange() {
        if (connection.connectionState !== "failed") return;
        resolvable.reject(new Error("Peer connection failed"));
      },
    });
  }, []);
  // Its own signal per run, so React.StrictMode's discarded first run neither
  // sends the user name nor takes the peer's name
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
          { type: "PEERNAME", data: userName },
          encrypt,
        );
        // The inbox keeps the peer's name if it arrived before this
        await handshake(
          await getChannelInbox(channel).take("PEERNAME", signal),
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
