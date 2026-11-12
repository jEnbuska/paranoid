import {
  useEmitIntroduction,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useNavigate } from "react-router";
import useComponentDidMount from "~/hooks/use-component-did-mount.ts";
import useReject from "~/hooks/use-reject.ts";
import useAsyncEffect from "~/hooks/use-async-effect.ts";
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
  const reject = useReject();
  useHandleInviteConnectionIceCandidatesExchange(reject);
  const emit = useEmitIntroduction();
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  const { setAnswerChannel } = useInviteCallbacks();
  // Added on mount rather than after the answer is sent: the channel only
  // arrives once the connection, which needs the answer, is established
  useAsyncEffect((signal) =>
    addPeerConnectionEventListeners(connection, signal, {
      async datachannel({ channel }) {
        void setAnswerChannel(channel);
      },
    }),
  );
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    onError: reject,
    async callback(description) {
      await connection.setRemoteDescription(description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await emit("DESCRIPTION", answer);
    },
  });
  const handshake = useHandleHandshake();
  useComponentDidMount(() => handshake.catch(reject));
  useOnEventDecrypted({
    type: "DONE",
    once: true,
    onError: reject,
    async callback() {
      await handshake;
      navigate("/chat", { replace: true });
    },
  });
  return <InviteView Component={ConnectionProgressList} />;
}
