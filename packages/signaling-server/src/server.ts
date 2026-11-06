import { createServer } from "node:http";
import { Server } from "socket.io";
import { handleHttpRequest } from "./http-handler.ts";
import {
  removeInvite,
  getInviteBySocket,
  getInviteCounterPartSocket,
} from "./invites.ts";
import { handleDone } from "./handlers/done.ts";
import { handleCreate } from "./handlers/create.ts";
import { handleEnter } from "./handlers/enter.ts";
import { handleJoin } from "./handlers/join.ts";
import { handleClose } from "./handlers/close.ts";
import { handleDescription } from "./handlers/description.ts";
import { handleCandidate } from "./handlers/candidate.ts";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "shared-lib/types";
import type { ServerSocket } from "./types.ts";

const port = Number(process.env.PORT || 8181);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
/** Browser origins allowed to connect: the Vite dev and preview servers by default */
const corsOrigins = (
  process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const httpServer = createServer(handleHttpRequest);
const io = new Server<ClientToServerEvents<false>, ServerToClientEvents<false>>(
  httpServer,
  // HTTP long-polling uses GET and POST. The client sends no cookies, so no credentials.
  { cors: { origin: corsOrigins, methods: ["GET", "POST"] } },
);

httpServer.listen(port, () => {
  console.log(
    `Signaling server listening on port ${port}, allowing ${corsOrigins.join(", ")}`,
  );
});

function shutDown(signal: NodeJS.Signals) {
  console.log(`${signal} received, closing the signaling server`);
  // Disconnects every socket and closes the HTTP server
  io.close(() => process.exit(0));
}
process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

io.on("connection", (socket) => {
  const socketId = socket.id;
  console.log("connected", socketId);

  /** Binds the handler to this socket and logs errors instead of crashing the server */
  function bindSocket<Args extends any[]>(
    handler: (socket: ServerSocket, ...args: Args) => void,
  ) {
    return (...args: Args) => {
      try {
        handler(socket, ...args);
      } catch (error) {
        console.error(error);
      }
    };
  }

  socket
    .on("disconnect", (reason) => {
      console.log("disconnected", socketId, reason);
      const invite = getInviteBySocket(socketId);
      if (!invite) return;
      const counterPartSocket = getInviteCounterPartSocket(socketId, invite);
      removeInvite(invite.id);
      if (!counterPartSocket) return;
      return socket.to(counterPartSocket).emit("CLOSE");
    })
    .on("CREATE", bindSocket(handleCreate))
    .on("ENTER", bindSocket(handleEnter))
    .on("JOIN", bindSocket(handleJoin))
    .on("DESCRIPTION", bindSocket(handleDescription))
    .on("CANDIDATE", bindSocket(handleCandidate))
    .on("DONE", bindSocket(handleDone))
    .on("CLOSE", bindSocket(handleClose));
});
