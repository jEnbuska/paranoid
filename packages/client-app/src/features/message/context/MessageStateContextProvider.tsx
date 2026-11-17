import { PropsWithChildren, useMemo } from "react";
import { MessageStateData } from "~/features/message/types";
import { appendMessage } from "~/features/message/utils";
import { useInviteState } from "~/features/invite/hooks";
import { getChannelInbox } from "~/features/channel/inbox.ts";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useUpdateState from "~/hooks/use-update-state";
import MessageStateContext from "./MessageStateContext";

/**
 * Holds the chat messages for as long as the data channel lives. Messages
 * that arrive before the chat mounts wait in the inbox until this takes them
 */
export default function MessageStateContextProvider({
  children,
}: PropsWithChildren) {
  const [state, updateState, getState] = useUpdateState<MessageStateData>(
    () => ({ messages: [] }),
  );
  const { channel } = useInviteState();
  // The only place that takes TEXT: a second loop would split the messages
  useAbortableEffect(
    async (signal) => {
      if (!channel) return;
      // The channel changed, or the invite was reset
      signal.addEventListener(
        "abort",
        () => void updateState({ messages: [] }),
      );
      const inbox = getChannelInbox(channel);
      while (!signal.aborted) {
        void updateState(appendMessage(await inbox.take("TEXT", signal)));
      }
    },
    [channel],
  );
  const value = useMemo(
    () => ({ state, updateState, getState }),
    [state, updateState, getState],
  );
  return (
    <MessageStateContext.Provider value={value}>
      {children}
    </MessageStateContext.Provider>
  );
}
