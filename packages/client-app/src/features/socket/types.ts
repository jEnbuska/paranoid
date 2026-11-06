import { Socket } from "socket.io-client";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
} from "shared-lib/types";

export type AppSocket = Socket<
  ServerToClientEvents<false>,
  ClientToServerEvents<false>
>;
