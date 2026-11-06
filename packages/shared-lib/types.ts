type Decryptable<Decrypted extends boolean, Data> = Decrypted extends true
  ? Data
  : string;

export interface ClientToServerEvents<Decrypted extends boolean = true> {
  /** User creates an invitation for another user to join */
  CREATE(
    args: { ttl: number; publicKey: Decryptable<false, string> },
    ack: (
      args:
        | { success: true; inviteId: string; expiresAt: number }
        | {
            success: false;
            type: "NON_CLOSED_INVITE_EXISTS" | "NON_CLOSED_OFFER_EXISTS";
          },
    ) => void,
  ): void;
  /** Invited person enters the room */
  ENTER(
    inviteId: string,
    ack: (
      args:
        | { success: true; expiresAt: number; publicKey: string }
        | {
            success: false;
            type:
              | "NON_CLOSED_INVITE_EXISTS"
              | "NON_CLOSED_OFFER_EXISTS"
              | "NOT_FOUND";
          },
    ) => void,
  ): void;

  /** Invite person */
  JOIN(publicKey: Decryptable<Decrypted, string>): void;

  /** One of the parties closes the invite */
  CLOSE(): void;

  /** Inviter / Invited person sends RTCSessionDescriptionInit to the other party */
  DESCRIPTION(
    description: Decryptable<Decrypted, RTCSessionDescriptionInit>,
  ): void;

  /** One of the parties offer candidates to the other party (Might be called multiple times by the inviter with different candidates) */
  CANDIDATE(candidate: Decryptable<Decrypted, RTCIceCandidate>): void;

  /** Party has no longer more candidates to provide.
   * Note: the other party might still be sending their candidates */
  DONE(): void;
}

export interface ServerToClientEvents<Decrypted extends boolean = true> {
  /** The other party has entered the invite room */
  ENTER(): void;

  JOIN(publicKey: Decryptable<Decrypted, string>): void;

  DESCRIPTION(
    description: Decryptable<Decrypted, RTCSessionDescriptionInit>,
  ): void;
  CANDIDATE(
    candidate: Decryptable<Decrypted, RTCIceCandidate>,
  ): void /** The other party has provided all ice candidates */;
  DONE(): void;

  CLOSE(): void;
}
