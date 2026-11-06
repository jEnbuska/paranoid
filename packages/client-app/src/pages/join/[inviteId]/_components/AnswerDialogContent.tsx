import { useEffect } from "react";
import EstablishingAnswerPeerConnection from "~/pages/join/[inviteId]/_components/EstablishingAnswerPeerConnection.tsx";
import AnswerOffer from "~/pages/join/[inviteId]/_components/AnswerOffer.tsx";
import { useInviteState } from "~/features/invite/hooks.ts";
import { useOnEvent, useSocket } from "~/features/socket/hooks.ts";
import { useHandleInviteDialogClosed } from "~/pages/hooks.ts";
import Conditional from "~/components/Conditional.tsx";
import useStable from "~/hooks/use-stable.ts";
import useThrowToErrorBoundary from "~/hooks/use-throw-to-error-boundary.ts";

export default function AnswerDialogContent() {
  useHandleInviteDialogClosed();
  const { peerPublicKey, stage } = useInviteState();
  const socket = useSocket();
  const throwToErrorBoundary = useThrowToErrorBoundary();
  // After the handshake the peers talk directly, so none of this ends the chat
  const connected = stage === "connected";
  const failJoin = useStable((message: string) => {
    if (!connected) throwToErrorBoundary(new Error(message));
  });
  useOnEvent("CLOSE", () => failJoin("Invite was closed"));
  useEffect(() => {
    const onDisconnect = () => failJoin("Signaling server disconnected");
    socket.on("disconnect", onDisconnect);
    return () => {
      socket.off("disconnect", onDisconnect);
    };
  }, [socket]);
  return (
    <>
      <AnswerOffer />
      <Conditional
        shown={!!peerPublicKey}
        Component={EstablishingAnswerPeerConnection}
      />
    </>
  );
}
