import ChatMessageList from "./@components/ChatMessageList";
import ChatForm from "./@components/ChatForm";
import ChatNav from "./@components/ChatNav";
import ChatAlert from "./@components/ChatAlert";
import Conditional from "~/components/Conditional";
import { useInviteState } from "~/features/invite/hooks";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";
import { useIsPeerConnected } from "~/features/peer-connection/hooks.ts";
import { assertIsNotNil } from "shared-lib/utils/nil";
import styles from "./styles.module.css";

export default function ChatPage() {
  const { channel, connection } = useInviteState();
  // ChatLayout leaves the chat without them
  assertIsNotNil(channel);
  assertIsNotNil(connection);
  // A lost connection goes to the error page
  const connected = useIsPeerConnected(connection, channel);
  // Leaving the chat closes the channel, which tells the peer
  useAbortableEffect((signal) => {
    signal.addEventListener("abort", () => channel.close());
  }, []);
  return (
    <main className={styles.chatPage}>
      <ChatNav />
      <div className={styles.messages}>
        <ChatMessageList />
      </div>
      <Conditional shown={!connected} Component={ChatAlert} severity="warning">
        Connection to the peer interrupted. Trying to reconnect…
      </Conditional>
      <ChatForm canSend={connected} />
    </main>
  );
}
