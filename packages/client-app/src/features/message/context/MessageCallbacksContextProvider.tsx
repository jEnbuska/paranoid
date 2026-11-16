import { PropsWithChildren } from "react";
import { MessageData } from "../types";
import { useAbortController } from "~/hooks/use-abort-controller";
import { useDecrypt } from "~/features/crypt/hooks";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import {
  useAddMessage,
  useCreateMessageCallbacks,
} from "~/features/message/hooks";
import { MessageCallbacksContext } from "./MessageCallbacksContext";
import { useInviteState } from "~/features/invite/hooks";
import { Navigate } from "react-router";

export default function MessageCallbacksContextProvider({
  children,
}: PropsWithChildren) {
  const inviteState = useInviteState();
  const { signal } = useAbortController();
  const addMessage = useAddMessage();
  const callbacks = useCreateMessageCallbacks(addMessage);
  const { channel } = inviteState;
  const decrypt = useDecrypt();
  useAbortableEffect(() => {
    channel?.addEventListener(
      "message",
      ({ data }: MessageEvent<string>) =>
        decrypt<MessageData>(data).then(addMessage),
      { signal },
    );
  }, []);
  if (inviteState.stage !== "connected") {
    return <Navigate to={"/"} replace />;
  }
  return (
    <MessageCallbacksContext.Provider value={callbacks}>
      {children}
    </MessageCallbacksContext.Provider>
  );
}
