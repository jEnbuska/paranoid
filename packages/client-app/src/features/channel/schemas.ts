import { z } from "zod";

/**
 * The shape of each channel message type's data. The data comes from the
 * peer, who can send anything, so the inbox parses it with these before
 * anything reads it. Unknown keys are stripped
 */
export const channelMessageDataSchemas = {
  DISPLAY_NAME: z.string(),
  // No `createdBy`: whatever the peer says, a received message is the other's
  TEXT: z.object({
    id: z.string(),
    createdAt: z.number(),
    data: z.string(),
  }),
  // What `addIceCandidate` takes (`RTCIceCandidateInit`)
  CANDIDATE: z.object({
    candidate: z.string().optional(),
    sdpMid: z.string().nullish(),
    sdpMLineIndex: z.number().nullish(),
    usernameFragment: z.string().nullish(),
  }),
};
