type InviteStageType = "none" | "offer" | "answer" | "connected";

export type InviteContextStateData = {
  active: boolean;
  inviteId: string;
  userId: string;
  stage: InviteStageType;
  userName: string;
  password: string;
  peerPublicKey: string;
  peerPublicKeyEncrypted: string;
  publicKey: string;
  privateKey: string;
  peerName: string;
  connection?: RTCPeerConnection;
  channel?: RTCDataChannel;
  expiresAt: number;
};

export type InviteContextCallbacks = {
  /** This should be called when the user wants to create an offer */
  initOffer(userName: string): Promise<void>;
  /**  This should be called after offer is initialized and the offer is sent to signaling server */
  offerCreated(args: {
    password: string;
    expiresAt: number;
    inviteId: string;
  }): Promise<void>;
  /** This should when user has entered a valid invite secret want's to join an offer */
  initAnswer(args: {
    inviteId: string;
    expiresAt: number;
    /** peers public key is encrypted using the password of the offer */
    peerPublicKeyEncrypted: string;
  }): Promise<void>;
  /** This should be called when user submits their username and the password for the invite */
  answerOffer(args: { password: string; userName: string }): Promise<void>;

  /** This should be called by the offerer when the other party has answered the offer with corret password */
  createOfferPeerConnection(peerPublicKeyEncrypted: string): Promise<void>;

  /** This should be called after peer connection is made and data channel has been acquired */
  setAnswerChannel(channel: RTCDataChannel): Promise<void>;

  /** This should be called after peer connection is made and data channel is acquired   */
  handshake(peerName: string): Promise<void>;
  /** This should be called everytime offer / answer flow is interrupted */
  resetInviteContext(): Promise<void>;
  /** This should be called when invite (answer / offer) dialog is closed */
  onClosed(): Promise<void>;
};

type InviteConnectionProgressData<T extends string, R extends string = ""> = {
  value: R;
  type: T;
  error?: string;
};

export type InviteConnectionProgressState =
  | InviteConnectionProgressData<"Signaling state", RTCSignalingState>
  | InviteConnectionProgressData<"ICE Gathering State", RTCIceGatheringState>
  | InviteConnectionProgressData<"ICE Connection State", RTCIceConnectionState>
  | InviteConnectionProgressData<"Peer Connection", RTCPeerConnectionState>
  | InviteConnectionProgressData<"Data Channel", RTCDataChannelState>;
