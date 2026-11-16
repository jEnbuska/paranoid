import {
  useEmitIntroduction,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useNavigate } from "react-router";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useReject from "~/hooks/use-reject.ts";
import {
  useInviteState,
  useHandleInviteConnectionIceCandidatesExchange,
  useHandleHandshake,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export default function EstablishingAnswerPeerConnection() {
  const navigate = useNavigate();
  const reject = useReject();
  useHandleInviteConnectionIceCandidatesExchange(reject);
  const emit = useEmitIntroduction();
  const { connection } = useInviteState();
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    onError: reject,
    async callback(description) {
      assertIsNotNil(connection);
      await connection.setRemoteDescription(description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await emit("DESCRIPTION", answer);
    },
  });
  const handshake = useHandleHandshake();
  useAbortableEffect(() => handshake, []);
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
