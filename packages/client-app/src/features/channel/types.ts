import type { MessageData } from "~/features/message/types";

/** Everything sent over the data channel. Encrypted as a whole, type included */
export type ChannelMessage =
  | { type: "PEERNAME"; data: string }
  | { type: "TEXT"; data: MessageData }
  | { type: "CANDIDATE"; data: RTCIceCandidateInit };

export type ChannelMessageType = ChannelMessage["type"];

export type ChannelMessageData<T extends ChannelMessageType> = Extract<
  ChannelMessage,
  { type: T }
>["data"];

export type Encrypt = <T>(data: T) => Promise<string>;
export type Decrypt = <T>(encrypted: string) => Promise<T>;
