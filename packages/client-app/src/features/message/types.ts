import type { ChannelMessageData } from "~/features/channel/types.ts";

/** A chat message: what goes over the channel, and who wrote it */
export type Message = ChannelMessageData<"TEXT"> & {
  createdBy: "self" | "other";
};
