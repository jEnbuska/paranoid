import {
  useEmitEventEncrypted,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useNavigate } from "react-router";
import useComponentDidMount from "~/hooks/use-component-did-mount.ts";
import {
  useInviteState,
  useHandleInviteConnectionIceCandidatesExchange,
  useHandleHandshake,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export default function EstablishingOfferPeerConnectionStep() {
  useHandleInviteConnectionIceCandidatesExchange();
  const navigate = useNavigate();
  const emit = useEmitEventEncrypted();
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  useComponentDidMount(() => {
    const { localDescription } = connection;
    assertIsNotNil(localDescription);
    void emit("DESCRIPTION", localDescription);
  });
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    callback: (description) => connection.setRemoteDescription(description),
  });
  const handshake = useHandleHandshake();
  useOnEventDecrypted({
    type: "DONE",
    once: true,
    async callback() {
      await handshake;
      navigate("/chat", { replace: true });
    },
  });
  return <InviteView Component={ConnectionProgressList} />;
}
