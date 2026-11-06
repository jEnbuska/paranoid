import {
  useEmitEventEncrypted,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useNavigate } from "react-router";
import useComponentDidMount from "~/hooks/use-component-did-mount.ts";
import useThrowToErrorBoundary from "~/hooks/use-throw-to-error-boundary.ts";
import { useAbortController } from "~/hooks/use-abort-controller.ts";
import {
  useInviteState,
  useInviteCallbacks,
  useHandleInviteConnectionIceCandidatesExchange,
  useHandleHandshake,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils.ts";

export default function EstablishingAnswerPeerConnection() {
  const navigate = useNavigate();
  const throwToErrorBoundary = useThrowToErrorBoundary();
  useHandleInviteConnectionIceCandidatesExchange(throwToErrorBoundary);
  const { signal } = useAbortController();
  const emit = useEmitEventEncrypted();
  const { connection } = useInviteState();
  const { setAnswerChannel } = useInviteCallbacks();
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    onError: throwToErrorBoundary,
    async callback(description) {
      assertIsNotNil(connection);
      await connection.setRemoteDescription(description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await emit("DESCRIPTION", answer);
      addPeerConnectionEventListeners(connection, signal, {
        async datachannel({ channel }) {
          void setAnswerChannel(channel);
        },
      });
    },
  });
  const handshake = useHandleHandshake();
  useComponentDidMount(() => handshake.catch(throwToErrorBoundary));
  useOnEventDecrypted({
    type: "DONE",
    once: true,
    onError: throwToErrorBoundary,
    async callback() {
      await handshake;
      navigate("/chat", { replace: true });
    },
  });
  return <InviteView Component={ConnectionProgressList} />;
}
