import { PropsWithChildren } from "react";
import { getChannelInbox } from "~/features/channel/inbox.ts";
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
  const addMessage = useAddMessage();
  const callbacks = useCreateMessageCallbacks(addMessage);
  const { channel } = inviteState;
  // Messages that arrived before the chat mounted wait in the inbox
  useAbortableEffect(async (signal) => {
    if (!channel) return;
    const inbox = getChannelInbox(channel);
    while (!signal.aborted) addMessage(await inbox.take("TEXT", signal));
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
