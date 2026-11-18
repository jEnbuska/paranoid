import { useOnEventDecrypted } from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import {
  useInviteState,
  useHandleInviteConnectionIceCandidatesExchange,
  useMoveToChatAfterHandshake,
  useSendOffer,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export default function EstablishingOfferPeerConnectionStep() {
  // Listens for candidates before the offer starts gathering them
  useHandleInviteConnectionIceCandidatesExchange();
  useSendOffer();
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    callback: (description) => connection.setRemoteDescription(description),
  });
  useMoveToChatAfterHandshake();
  return <InviteView Component={ConnectionProgressList} />;
}
