import {
  useEmitIntroduction,
  useOnEventDecrypted,
} from "~/features/socket/hooks.ts";
import ConnectionProgressList from "~/features/invite/_components/ConnectionProgressList/ConnectionProgressList.tsx";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import {
  useInviteState,
  useHandleInviteConnectionIceCandidatesExchange,
  useMoveToChatAfterHandshake,
} from "~/features/invite/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export default function EstablishingOfferPeerConnectionStep() {
  // Listens for candidates before the offer below starts gathering them
  useHandleInviteConnectionIceCandidatesExchange();
  const emit = useEmitIntroduction();
  const { connection } = useInviteState();
  assertIsNotNil(connection);
  useAbortableEffect(async () => {
    // Only once per connection: leaving the chat renders this step again for
    // a moment, before the invite is reset
    if (connection.localDescription) return;
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await emit("DESCRIPTION", offer);
  }, []);
  useOnEventDecrypted({
    type: "DESCRIPTION",
    once: true,
    callback: (description) => connection.setRemoteDescription(description),
  });
  useMoveToChatAfterHandshake();
  return <InviteView Component={ConnectionProgressList} />;
}
