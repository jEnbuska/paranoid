import { useEffect, useReducer, useMemo, use } from "react";
import {
  useOnEventDecrypted,
  useEmitEventEncrypted,
} from "~/features/socket/hooks";
import { useAbortController } from "~/hooks/use-abort-controller";
import { assertIsNotNil } from "shared-lib/utils/nil";
import useComponentDidMount from "~/hooks/use-component-did-mount";
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
import { useResolvable } from "~/hooks/use-resolvable";
import invoke from "shared-lib/utils/invoke";
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
  const emit = useEmitEventEncrypted();
  const { signal } = useAbortController();
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  useComponentDidMount(() =>
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
  useEffect(() => {
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
  }, [channel]);
  return progress;
}

export function useHandleHandshake() {
  const { channel, connection } = useInviteState();
  const { signal } = useAbortController();
  const { handshake } = useInviteCallbacks();
  const { userName } = useInviteState();
  const decrypt = useDecrypt();
  const encrypt = useEncrypt();
  const resolvable = useResolvable();
  useComponentDidMount(() => {
    assertIsNotNil(connection);
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange() {
        if (connection.connectionState !== "failed") return;
        resolvable.reject(new Error("Peer connection failed"));
      },
    });
  });
  useEffect(() => {
    if (!channel) return;
    // Abort per effect run so React.StrictMode's second run does not add a
    // second listener and send the user name twice
    const controller = new AbortController();
    invoke(async () => {
      const options = {
        once: true,
        signal: controller.signal,
      };
      {
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
      }
      {
        const { resolve, reject, promise } = await createResolvable(
          controller.signal,
        );
        channel.addEventListener("open", () => resolve(), options);
        channel.addEventListener(
          "error",
          () => reject(new Error("Data channel failed")),
          options,
        );
        if (channel.readyState === "open") resolve();
        await promise;
        channel.send(await encrypt(userName));
      }
    }).catch(resolvable.reject);
    return () => controller.abort();
  }, [channel]);
  return resolvable.promise;
}
