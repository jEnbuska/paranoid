import ChatMessageList from "./@components/ChatMessageList";
import ChatForm from "./@components/ChatForm";
import ChatNav from "./@components/ChatNav";
import ChatAlert from "./@components/ChatAlert";
import Conditional from "~/components/Conditional";
import { useState } from "react";
import { useInviteState } from "~/features/invite/hooks";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import useReject from "~/hooks/use-reject.ts";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils";
import { assertIsNotNil } from "shared-lib/utils/nil";
import styles from "./styles.module.css";

export default function ChatPage() {
  const { channel, connection } = useInviteState();
  assertIsNotNil(channel);
  assertIsNotNil(connection);
  const reject = useReject();
  const [connected, setConnected] = useState(true);
  useAbortableEffect((signal) => {
    const update = () => {
      // Chromium doesn't close the channel when the peer's page goes away
      // without closing it. The connection fails instead
      if (
        connection.connectionState === "failed" ||
        channel.readyState === "closed"
      ) {
        reject(new Error("Connection to peer lost"));
      }
      // Anything else, like `disconnected`, can still recover by itself
      setConnected(
        connection.connectionState === "connected" &&
          channel.readyState === "open",
      );
    };
    channel.addEventListener("close", update, { signal });
    addPeerConnectionEventListeners(connection, signal, {
      connectionstatechange: update,
    });
    update();
    signal.addEventListener("abort", () => channel.close());
  }, []);
  return (
    <main className={styles.chatPage}>
      <ChatNav />
      <div className={styles.messages}>
        <ChatMessageList />
      </div>
      <Conditional shown={!connected} Component={ChatAlert} severity="warning">
        Connection interrupted. Trying to reconnect…
      </Conditional>
      <ChatForm canSend={connected} />
    </main>
  );
}
