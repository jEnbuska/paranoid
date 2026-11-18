import { PropsWithChildren, useMemo } from "react";
import { Message } from "~/features/message/types";
import { useInviteState } from "~/features/invite/hooks";
import { getChannelInbox } from "~/features/channel/inbox.ts";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import MessageContext from "./MessageContext.ts";
import { v4 as uuid } from "uuid";
import { useEncrypt } from "~/features/crypt/hooks.ts";
import useStable from "~/hooks/use-stable.ts";
import { sendChannelMessage } from "~/features/channel/send.ts";
import type { ChannelMessageData } from "~/features/channel/types.ts";
import useDerivedState from "~/hooks/use-derived-state.ts";
import { useChatExits } from "~/features/misc/hooks.ts";

/**
 * Holds the chat messages until the person leaves the chat. Messages that
 * arrive before the chat mounts wait in the inbox until this takes them
 */
export default function MessageContextProvider({
  children,
}: PropsWithChildren) {
  const chatExists = useChatExits();
  const [messages, setMessages] = useDerivedState<Message[]>([], [chatExists]);
  const { channel } = useInviteState();
  useAbortableEffect(
    async function setupTextMessageReceiving(signal) {
      if (!channel) return;
      const inbox = getChannelInbox(channel);
      while (!signal.aborted) {
        const message = await inbox.take("TEXT", signal);
        // Whatever the peer says, a received message is the other's
        setMessages((messages) => [
          ...messages,
          { ...message, createdBy: "other" },
        ]);
      }
    },
    [channel],
  );
  const encrypt = useEncrypt();
  const sendMessage = useStable(async (text: string) => {
    // Who wrote a message is local knowledge, so `createdBy` stays here
    const sent: ChannelMessageData<"TEXT"> = {
      id: uuid(),
      createdAt: Date.now(),
      data: text,
    };
    await sendChannelMessage(channel, { type: "TEXT", data: sent }, encrypt);
    setMessages((messages) => [...messages, { ...sent, createdBy: "self" }]);
  });
  const value = useMemo(() => {
    return {
      messages: messages.sort((a, b) => a.createdAt - b.createdAt),
      sendMessage,
    };
  }, [messages]);
  return (
    <MessageContext.Provider value={value}>{children}</MessageContext.Provider>
  );
}
