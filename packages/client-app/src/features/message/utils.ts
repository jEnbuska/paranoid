import { v4 as uuid } from "uuid";
import { MessageCallbacksData, MessageData } from "./types";

export function createMessageCallbacks(args: {
  userId: string;
  channel: RTCDataChannel;
  encrypt: <T>(data: T) => Promise<string>;
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
      const encrypted = await encrypt(message);
      // Firefox drops a message sent on a closed channel instead of throwing
      if (channel.readyState !== "open") {
        throw new Error("Data channel not open");
      }
      channel.send(encrypted);
      addMessage(message);
    },
  };
}
