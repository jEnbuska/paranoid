import { AppSocket } from "~/features/socket/types";
import { io } from "socket.io-client";
import { SIGNALING_SERVER } from "~/constants";
import createResolvable from "shared-lib/utils/create-resolvable";
import { queryClient } from "~/query-client";
import { socketQueryKey } from "~/features/socket/constants";
import { createLoader } from "~/features/loader/utils";
import { getInbox } from "~/features/socket/inbox.ts";

export async function createSocket(): Promise<AppSocket> {
  const socket: AppSocket = io(SIGNALING_SERVER, {
    reconnection: true,
    reconnectionAttempts: 30,
    reconnectionDelay: 2000, // Try to reconnect every 2 second's
  });
  // Listens for handshake events from the start, so none arrive before a
  // component is ready to read them
  const inbox = getInbox(socket);

  const { resolve, reject, promise } = await createResolvable<AppSocket>();
  socket
    .on("connect", () => {
      console.log("🔌 Connected:", socket.id);
      resolve(socket);
    })
    .on("disconnect", (reason) => {
      console.warn("❌ Disconnected:", reason);
      // The server drops the invite when either side disconnects, so anything
      // still unread belongs to an invite that no longer exists
      inbox.clear();
      if (reason === "io server disconnect") {
        socket.connect(); // Manually reconnect if the server disconnected us
      }
    })
    .on("connect_error", (error) => {
      console.error("⚠️ Connection error:", error);
      reject(error);
    });
  return promise;
}

async function reloadSocket() {
  const existingSocket = queryClient.getQueryData<AppSocket>(socketQueryKey);
  existingSocket?.disconnect();
  const socket = await createSocket();
  queryClient.setQueryData(socketQueryKey, socket);
  return socket;
}
export const socketLoader = createLoader("server socket", reloadSocket);
