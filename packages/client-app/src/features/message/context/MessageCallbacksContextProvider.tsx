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
  const addMessage = useAddMessage();
  const callbacks = useCreateMessageCallbacks(addMessage);
  if (inviteState.stage !== "connected") {
    return <Navigate to={"/"} replace />;
  }
  return (
    <MessageCallbacksContext.Provider value={callbacks}>
      {children}
    </MessageCallbacksContext.Provider>
  );
}
