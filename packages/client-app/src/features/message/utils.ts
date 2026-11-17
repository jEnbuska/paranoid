import { v4 as uuid } from "uuid";
import { MessageCallbacksData, MessageData, MessageStateData } from "./types";
import { sendChannelMessage } from "~/features/channel/send.ts";
import type { Encrypt } from "~/features/channel/types.ts";

export function createMessageCallbacks(args: {
  userId: string;
  channel: RTCDataChannel;
  encrypt: Encrypt;
  addMessage(message: MessageData): void;
}): MessageCallbacksData {
  const { userId, channel, encrypt, addMessage } = args;
  return {
    async sendTextMessage(text) {
      const message: MessageData = {
        id: uuid(),
        createdAt: Date.now(),
        createdBy: userId,
        data: text,
      };
      await sendChannelMessage(
        channel,
        { type: "TEXT", data: message },
        encrypt,
      );
      addMessage(message);
    },
  };
}

/**
 * An update that adds the message after the messages in the previous state,
 * including ones that haven't rendered yet
 */
export function appendMessage(message: MessageData) {
  return (prevState: MessageStateData): MessageStateData => ({
    messages: [...prevState.messages, message],
  });
}
