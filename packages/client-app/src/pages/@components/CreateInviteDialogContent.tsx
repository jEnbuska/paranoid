import Stepper from "~/components/Stepper/Stepper.tsx";
import EstablishingOfferPeerConnectionStep from "./EstablishingOfferPeerConnectionStep.tsx";
import CreateOffer from "./CreateOffer.tsx";
import ExchangeOfferInvite from "./ExchangeOfferInvite.tsx";
import invoke from "shared-lib/utils/invoke";
import { useOnEvent, useSocket } from "~/features/socket/hooks.ts";
import { useInviteState, useInviteCallbacks } from "~/features/invite/hooks.ts";
import { useMutation } from "@tanstack/react-query";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useStable from "~/hooks/use-stable.ts";
import InviteStateContext from "~/features/invite/context/InviteStateContext.tsx";
import { use, useEffect } from "react";
import useReject from "~/hooks/use-reject.ts";

export default function CreateInviteDialogContent() {
  const { getState } = use(InviteStateContext);
  const { resetInviteContext } = useInviteCallbacks();
  const socket = useSocket();
  const onUnmount = useStable(() => {
    // The stage from the current state: the dialog's content unmounts without
    // rendering again when the finished handshake closes the dialog
    switch (getState().stage) {
      case "offer":
        socket.emit("CLOSE");
        void resetInviteContext();
    }
  });
  useAbortableEffect((signal) => {
    signal.addEventListener("abort", onUnmount);
  }, []);
  const { peerPublicKey, inviteId } = useInviteState();
  const { createOfferPeerConnection } = useInviteCallbacks();
  const { mutateAsync } = useMutation({
    mutationFn: createOfferPeerConnection,
    throwOnError: true,
  });
  useOnEvent("JOIN", mutateAsync);
  useOnEvent("CLOSE", () => {
    throw new Error("Invite was closed");
  });
  // The server forgets the invite when its socket disconnects. A socket
  // listener runs outside an effect, so it reports through useReject
  const reject = useReject();
  useEffect(() => {
    const onDisconnect = () => {
      // The current state: after the handshake the peers talk directly, so a
      // drop doesn't end the chat, and before the invite is created there is
      // nothing on the server to lose
      const { inviteId, stage } = getState();
      if (inviteId && stage !== "connected") {
        reject(new Error("Signaling server disconnected"));
      }
    };
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("disconnect", onDisconnect);
    };
  }, [socket]);
  const step = invoke(() => {
    if (peerPublicKey) return 2;
    if (inviteId) return 1;
    return 0;
  });
  return (
    <Stepper
      activeStep={step}
      steps={[
        { label: "Invite Chat Information", content: <CreateOffer /> },
        {
          label: "Exchange Invite Secret",
          content: <InviteView Component={ExchangeOfferInvite} />,
        },
        {
          label: "Establish Peer Connection",
          content: <EstablishingOfferPeerConnectionStep />,
        },
      ]}
    />
  );
}
