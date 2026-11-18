import {
  useEmitIntroduction,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import {
  useInviteState,
  useHandleInviteConnectionIceCandidatesExchange,
  useMoveToChatAfterHandshake,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export default function EstablishingAnswerPeerConnection() {
  useHandleInviteConnectionIceCandidatesExchange();
  const emit = useEmitIntroduction();
  const { connection } = useInviteState();
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    async callback(description) {
      assertIsNotNil(connection);
      await connection.setRemoteDescription(description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await emit("DESCRIPTION", answer);
    },
  });
  useMoveToChatAfterHandshake();
  return <InviteView Component={ConnectionProgressList} />;
}
