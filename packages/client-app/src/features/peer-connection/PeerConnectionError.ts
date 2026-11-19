/** Why the connection to the peer ended for good */
type PeerConnectionErrorCause = "failed" | "timed-out" | "lost";

const messages: Record<PeerConnectionErrorCause, string> = {
  failed: "Connecting to the peer failed",
  "timed-out": "Connecting to the peer timed out",
  lost: "Connection to the peer lost",
};

/**
 * A connection to the peer that can't be made or is gone. With no server to
 * reconnect through, it can't recover, and the error page shows its message
 */
export class PeerConnectionError extends Error {
  name = "PeerConnectionError";
  constructor(cause: PeerConnectionErrorCause) {
    super(messages[cause]);
  }
}
