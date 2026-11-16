import { sendChannelMessage } from "./send.ts";
import type { Encrypt } from "./types.ts";
import type { ChannelInbox } from "./inbox.ts";

/**
 * Sends local candidates over the channel once it's open, and adds the peer's
 * candidates from the channel, for as long as the channel lives. Until the
 * channel is open, candidates go over the signaling server
 * (`useHandleInviteConnectionIceCandidatesExchange`)
 */
export function exchangeCandidatesOverChannel(args: {
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  inbox: ChannelInbox;
  encrypt: Encrypt;
}) {
  const { connection, channel, inbox, encrypt } = args;
  const { signal } = inbox;
  connection.addEventListener(
    "icecandidate",
    ({ candidate }) => {
      if (!candidate || channel.readyState !== "open") return;
      sendChannelMessage(
        channel,
        { type: "CANDIDATE", data: candidate.toJSON() },
        encrypt,
      ).catch((error) => {
        console.error("Failed to send a candidate over the channel", error);
      });
    },
    { signal },
  );
  void (async () => {
    while (!signal.aborted) {
      // Rejects when the inbox is cleared, which ends the loop
      const candidate = await inbox.take("CANDIDATE", signal);
      await connection.addIceCandidate(candidate).catch((error) => {
        console.error("Failed to add a candidate from the channel", error);
      });
    }
  })().catch(() => {});
}
