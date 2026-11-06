import { use } from "react";
import { useSocket } from "~/features/socket/hooks";
import InviteStateContext from "~/features/invite/context/InviteStateContext";
import { useInviteState, useInviteCallbacks } from "~/features/invite/hooks";
import useStable from "~/hooks/use-stable.ts";
import { encryptWithPassword } from "~/features/crypt/utils/password";
import { useComponentDidUnmount } from "~/hooks/use-component-did-unmount";
import pick from "shared-lib/utils/pick";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router";

const ENTER_TIMEOUT_MS = 10_000;

export function useCreateOffer() {
  const socket = useSocket();
  const { publicKey } = useInviteState();
  const { offerCreated } = useInviteCallbacks();
  return useStable(async (args: { ttl: number; password: string }) => {
    const { ttl, password } = args;
    const response = await socket.emitWithAck("CREATE", {
      ttl: ttl * 1000,
      publicKey: await encryptWithPassword(publicKey, { password }),
    });
    if (!response.success) throw new Error("Failed to create invite");
    return offerCreated({
      password,
      ...pick(["expiresAt", "inviteId"], response),
    });
  });
}

export function useInitAnswer() {
  const socket = useSocket();
  const { initAnswer } = useInviteCallbacks();
  const inviteId = useParams().inviteId!;
  return useQuery({
    retry: false,
    throwOnError: true,
    async queryFn() {
      const response = await socket
        .timeout(ENTER_TIMEOUT_MS)
        .emitWithAck("ENTER", inviteId);
      if (!response.success) throw new Error("Error entering invite");
      const { expiresAt, publicKey } = response;
      await initAnswer({
        inviteId,
        expiresAt,
        peerPublicKeyEncrypted: publicKey,
      });
      return null;
    },
    queryKey: ["ANSWER", inviteId],
  });
}

export function useAnswerOffer() {
  const socket = useSocket();
  const { answerOffer } = useInviteCallbacks();
  const { publicKey } = useInviteState();
  return useStable(async (args: { userName: string; password: string }) => {
    const { userName, password } = args;
    socket.emit("JOIN", await encryptWithPassword(publicKey, { password }));
    return answerOffer({
      password,
      userName,
    });
  });
}

export function useHandleInviteDialogClosed() {
  const { getState } = use(InviteStateContext);
  const { resetInviteContext } = useInviteCallbacks();
  const socket = useSocket();
  useComponentDidUnmount(() => {
    // The stage from the current state: the dialog's content unmounts without
    // rendering again when the finished handshake closes the dialog
    switch (getState().stage) {
      case "offer":
      case "answer":
        socket.emit("CLOSE");
        void resetInviteContext();
    }
  });
}
