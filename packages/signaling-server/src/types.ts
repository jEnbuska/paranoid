import { Socket } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "shared-lib/types";

export type ServerSocket = Socket<
  ClientToServerEvents<false>,
  ServerToClientEvents<false>
>;

export type HandleNonEncrypted<Event extends keyof ClientToServerEvents> = (
  socket: ServerSocket,
  ...args: Parameters<ClientToServerEvents<true>[Event]>
) => void;

export type HandleEncrypted<Event extends keyof ClientToServerEvents> = (
  socket: ServerSocket,
  ...args: Parameters<ClientToServerEvents<false>[Event]>
) => void;
