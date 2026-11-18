import type { z } from "zod";
import type { channelMessageDataSchemas } from "./schemas.ts";

type Schemas = typeof channelMessageDataSchemas;

export type ChannelMessageType = keyof Schemas;

export type ChannelMessageData<T extends ChannelMessageType> = z.infer<
  Schemas[T]
>;

/** Everything sent over the data channel. Encrypted as a whole, type included */
export type ChannelMessage = {
  [T in ChannelMessageType]: { type: T; data: ChannelMessageData<T> };
}[ChannelMessageType];

export type Encrypt = <T>(data: T) => Promise<string>;
export type Decrypt = <T>(encrypted: string) => Promise<T>;
