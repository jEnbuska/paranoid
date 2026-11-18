import ChatMessageList from "./@components/ChatMessageList";
import ChatForm from "./@components/ChatForm";
import ChatNav from "./@components/ChatNav";
import Conditional from "~/components/Conditional";
import { useState } from "react";
import Alert from "~/components/Alert/Alert";
import { useInviteState } from "~/features/invite/hooks";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import { addPeerConnectionEventListeners } from "~/features/peer-connection/utils";
import styles from "./styles.module.css";

export default function ChatPage() {
  const { channel, connection } = useInviteState();
  const [closed, setClosed] = useState(false);
  useAbortableEffect((signal) => {
    channel?.addEventListener("close", () => setClosed(true), { signal });
    // A peer that disappears without closing, for example when its tab
    // crashes, its network drops or its close is lost, never closes the
    // channel in Chromium. The connection fails instead, and with no
    // signaling server to reconnect through, the peer is gone for good
    if (connection) {
      addPeerConnectionEventListeners(connection, signal, {
        connectionstatechange() {
          if (connection.connectionState === "failed") setClosed(true);
        },
      });
    }
    signal.addEventListener("abort", () => channel?.close());
  }, []);
  return (
    <main className={styles.chatPage}>
      <ChatNav />
      <Conditional
        shown={closed}
        element={"div"}
        className={styles.connectionLost}
      >
        <Alert severity={"error"}>Connection to peer lost</Alert>
      </Conditional>
      <Conditional shown={!closed}>
        <div className={styles.messages}>
          <ChatMessageList />
        </div>
        <ChatForm />
      </Conditional>
    </main>
  );
}
