import ChatMessageList from "./@components/ChatMessageList";
import ChatForm from "./@components/ChatForm";
import ChatNav from "./@components/ChatNav";
import ChatAlert from "./@components/ChatAlert";
import Conditional from "~/components/Conditional";
import { useChatConnection } from "./hooks.ts";
import styles from "./styles.module.css";

export default function ChatPage() {
  const connected = useChatConnection();
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
