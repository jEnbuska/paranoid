import { PropsWithChildren } from "react";
import { MessageData } from "../types";
import { useDecrypt } from "~/features/crypt/hooks";
import useComponentDidMount from "~/hooks/use-component-did-mount";
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
  const addMessage = useAddMessage();
  const callbacks = useCreateMessageCallbacks(addMessage);
  const { channel } = inviteState;
  const decrypt = useDecrypt();
  useComponentDidMount((signal) => {
    channel?.addEventListener(
      "message",
      ({ data }: MessageEvent<string>) =>
        decrypt<MessageData>(data).then(addMessage),
      { signal },
    );
  });
  if (inviteState.stage !== "connected") {
    return <Navigate to={"/"} replace />;
  }
  return (
    <MessageCallbacksContext.Provider value={callbacks}>
      {children}
    </MessageCallbacksContext.Provider>
  );
}
