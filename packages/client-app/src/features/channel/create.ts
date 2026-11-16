import { createChannelInbox } from "./inbox.ts";
import { exchangeCandidatesOverChannel } from "./candidates.ts";
import type { Decrypt, Encrypt } from "./types.ts";

/**
 * Both sides create the channel themselves, and its inbox starts reading it
 * right away. So the peer's keys have to be known by then
 */
export function createMetaChannel(
  connection: RTCPeerConnection,
  crypt: { encrypt: Encrypt; decrypt: Decrypt },
) {
  const channel = connection.createDataChannel("meta", {
    negotiated: true,
    id: 1,
    ordered: true, // Ensure data is received in the order it's sent
    protocol: "meta-data",
  });
  const inbox = createChannelInbox(channel, crypt.decrypt);
  exchangeCandidatesOverChannel({
    connection,
    channel,
    inbox,
    encrypt: crypt.encrypt,
  });
  return channel;
}
