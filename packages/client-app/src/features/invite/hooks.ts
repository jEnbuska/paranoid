import { useReducer, useMemo, use } from "react";
import useAsyncEffect from "~/hooks/use-async-effect";
import {
  useOnEventDecrypted,
  useEmitIntroduction,
} from "~/features/socket/hooks";
import { assertIsNotNil } from "shared-lib/utils/nil";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils";
import { useMemoOnce } from "~/hooks/use-memo-once";
import constList from "shared-lib/utils/const-list";
import { InviteConnectionProgressState } from "~/features/invite/types";
import { inviteConnectionStateTypes } from "~/features/invite/constants";
import { getConnectionStateProgress } from "~/features/invite/utils";
import sleep from "shared-lib/utils/sleep";
import { useDecrypt, useEncrypt } from "~/features/crypt/hooks";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import InviteCallbacksContext from "~/features/invite/context/InviteCallbacksContext";
import createResolvable from "shared-lib/utils/create-resolvable";

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
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  useAsyncEffect((signal) =>
    addPeerConnectionEventListeners(connection, signal, {
      icecandidate({ candidate }) {
        if (candidate) {
          void emit("CANDIDATE", candidate).catch(onError);
        } else {
          void emit("DONE").catch(onError);
        }
      },
    }),
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

  useAsyncEffect((signal) => {
    addPeerConnectionEventListeners(connection, signal, {
      signalingstatechange: () => addConnectionProgress("signalingState"),
      connectionstatechange: () => addConnectionProgress("connectionState"),
      icegatheringstatechange: () => addConnectionProgress("iceGatheringState"),
      icecandidateerror: (e) =>
        addConnectionProgress("iceGatheringState", (e as any)?.errorText),
      iceconnectionstatechange: () =>
        addConnectionProgress("iceConnectionState"),
    });
    // Catches up with what changed after rendering, before the listeners
    // were added
    inviteConnectionStateTypes.forEach((state, index) => {
      const { value } = getConnectionStateProgress(connection, state);
      if (value !== initialState[index].value) addConnectionProgress(state);
    });
  });
  useAsyncEffect(
    (signal) => {
      if (!channel) return;
      const type = "Data Channel" as const;
      constList(
        "open",
        "close",
        "closing",
        "message",
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

export function useHandleHandshake() {
  const { channel, connection, userName } = useInviteState();
  const { handshake } = useInviteCallbacks();
  const decrypt = useDecrypt();
  const encrypt = useEncrypt();
  const resolvable = useMemoOnce(() => createResolvable());
  useAsyncEffect((signal) => {
    assertIsNotNil(connection);
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange() {
        if (connection.connectionState !== "failed") return;
        resolvable.reject(new Error("Peer connection failed"));
      },
    });
  });
  useAsyncEffect(
    async (signal) => {
      if (!channel) return;
      const options = { once: true, signal };
      const { resolve, reject } = resolvable;
      channel.addEventListener(
        "message",
        (e) =>
          decrypt<string>(e.data).then(handshake).then(resolve).catch(reject),
        options,
      );
      channel.addEventListener(
        "close",
        () => reject(new Error("Data channel closed during handshake")),
        options,
      );
      try {
        const opened = createResolvable(signal);
        channel.addEventListener("open", () => opened.resolve(), options);
        channel.addEventListener(
          "error",
          () => opened.reject(new Error("Data channel failed")),
          options,
        );
        if (channel.readyState === "open") opened.resolve();
        await opened.promise;
        const encrypted = await encrypt(userName);
        // React.StrictMode's first run gets here too when the channel is
        // already open, and must not send the user name a second time
        if (signal.aborted) return;
        channel.send(encrypted);
      } catch (error) {
        if (!signal.aborted) reject(error);
      }
    },
    [channel],
  );
  return resolvable.promise;
}
