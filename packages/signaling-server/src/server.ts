import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { constants } from "node:os";
import { Server } from "socket.io";
import { handleHttpRequest } from "./http-handler.ts";
import { limitInvites } from "./invites.ts";
import { parseMaxInvites } from "./max-invites.ts";
import { handleDisconnect } from "./handlers/disconnect.ts";
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
const maxInvites = parseMaxInvites(process.env.MAX_INVITES);

const httpServer = createServer(handleHttpRequest);
const io = new Server<ClientToServerEvents<false>, ServerToClientEvents<false>>(
  httpServer,
  // HTTP long-polling uses GET and POST. The client sends no cookies, so no credentials.
  { cors: { origin: corsOrigins, methods: ["GET", "POST"] } },
);

httpServer.listen(port, () => {
  // The port it got, when PORT is 0
  const { port: actualPort } = httpServer.address() as AddressInfo;
  console.log(
    `Signaling server listening on port ${actualPort}, allowing ${corsOrigins.join(", ")}`,
  );
  console.log(
    maxInvites
      ? `Invite limit: ${maxInvites}, exiting once they're all finished`
      : "No invite limit, not exiting on its own",
  );
});

let closing = false;
/**
 * Disconnects every socket, closes the HTTP server and exits. Exit code 0 means
 * only that the invite limit was reached and every invite finished, so a
 * deployment can tell that from anything else and shut down
 */
function close(exitCode: number) {
  if (closing) return;
  closing = true;
  io.close((error) => {
    if (error) console.error(error);
    process.exit(error ? 1 : exitCode);
  });
}

function shutDown(signal: NodeJS.Signals) {
  console.log(`${signal} received, closing the signaling server`);
  // The code a shell reports for a process the signal ended, never 0
  close(128 + constants.signals[signal]);
}
process.once("SIGINT", shutDown);
process.once("SIGTERM", shutDown);

if (maxInvites) {
  limitInvites({
    max: maxInvites,
    onLastInviteFinished() {
      console.log("Invite limit reached, exiting");
      // Lets the handler that removed the last invite send its events first
      setImmediate(() => close(0));
    },
  });
}

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
      handleDisconnect(socket);
    })
    .on("CREATE", bindSocket(handleCreate))
    .on("ENTER", bindSocket(handleEnter))
    .on("JOIN", bindSocket(handleJoin))
    .on("DESCRIPTION", bindSocket(handleDescription))
    .on("CANDIDATE", bindSocket(handleCandidate))
    .on("DONE", bindSocket(handleDone))
    .on("CLOSE", bindSocket(handleClose));
});
