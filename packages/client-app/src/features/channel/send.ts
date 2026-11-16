import type { ChannelMessage, Encrypt } from "./types.ts";

export async function sendChannelMessage(
  channel: RTCDataChannel,
  message: ChannelMessage,
  encrypt: Encrypt,
) {
  const encrypted = await encrypt(message);
  // Firefox drops a message sent on a closed channel instead of throwing
  if (channel.readyState !== "open") {
    throw new Error("Data channel not open");
  }
  channel.send(encrypted);
}
