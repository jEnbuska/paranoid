import Stepper from "~/components/Stepper/Stepper.tsx";
import EstablishingOfferPeerConnectionStep from "./EstablishingOfferPeerConnectionStep.tsx";
import CreateOffer from "./CreateOffer.tsx";
import ExchangeOfferInvite from "./ExchangeOfferInvite.tsx";
import invoke from "shared-lib/utils/invoke";
import { useOnEvent, useSocket } from "~/features/socket/hooks.ts";
import { useInviteState, useInviteCallbacks } from "~/features/invite/hooks.ts";
import { useMutation } from "@tanstack/react-query";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import useReject from "~/hooks/use-reject.ts";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useStable from "~/hooks/use-stable.ts";
import InviteStateContext from "~/features/invite/context/InviteStateContext.tsx";
import { use } from "react";

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
  const reject = useReject();
  const { mutateAsync } = useMutation({
    mutationFn: createOfferPeerConnection,
    throwOnError: true,
  });
  useOnEvent("JOIN", mutateAsync);
  useOnEvent("CLOSE", () => reject(new Error("Invite was closed")));
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
