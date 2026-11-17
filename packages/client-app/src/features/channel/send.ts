import type { ChannelMessage, Encrypt } from "./types.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";

export async function sendChannelMessage(
  channel: RTCDataChannel | undefined,
  message: ChannelMessage,
  encrypt: Encrypt,
) {
  assertIsNotNil(channel);
  const encrypted = await encrypt(message);
  // Firefox drops a message sent on a closed channel instead of throwing
  if (channel.readyState !== "open") {
    throw new Error("Data channel not open");
  }
  channel.send(encrypted);
}
