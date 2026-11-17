import { PropsWithChildren } from "react";
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
  if (inviteState.stage !== "connected") {
    return <Navigate to={"/"} replace />;
  }
  return <ConnectedMessageCallbacks>{children}</ConnectedMessageCallbacks>;
}

/** The callbacks need the channel, so they're only created once connected */
function ConnectedMessageCallbacks({ children }: PropsWithChildren) {
  const addMessage = useAddMessage();
  const callbacks = useCreateMessageCallbacks(addMessage);
  return (
    <MessageCallbacksContext.Provider value={callbacks}>
      {children}
    </MessageCallbacksContext.Provider>
  );
}
