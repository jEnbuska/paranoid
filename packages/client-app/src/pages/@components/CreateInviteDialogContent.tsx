import Stepper from "~/components/Stepper/Stepper.tsx";
import EstablishingOfferPeerConnectionStep from "./EstablishingOfferPeerConnectionStep.tsx";
import CreateOffer from "./CreateOffer.tsx";
import ExchangeOfferInvite from "./ExchangeOfferInvite.tsx";
import invoke from "shared-lib/utils/invoke";
import { useOnEvent } from "~/features/socket/hooks.ts";
import { useInviteState, useInviteCallbacks } from "~/features/invite/hooks.ts";
import { useMutation } from "@tanstack/react-query";
import InviteView from "~/features/invite/_components/InviteView.tsx";
import { useHandleInviteDialogClosed } from "~/pages/hooks.ts";
import useThrowToErrorBoundary from "~/hooks/use-throw-to-error-boundary.ts";

export default function CreateInviteDialogContent() {
  useHandleInviteDialogClosed();
  const { peerPublicKey, inviteId } = useInviteState();
  const { createOfferPeerConnection } = useInviteCallbacks();
  const throwToErrorBoundary = useThrowToErrorBoundary();
  const { mutateAsync } = useMutation({
    mutationFn: createOfferPeerConnection,
    throwOnError: true,
  });
  useOnEvent("JOIN", mutateAsync);
  useOnEvent("CLOSE", () =>
    throwToErrorBoundary(new Error("Invite was closed")),
  );
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
