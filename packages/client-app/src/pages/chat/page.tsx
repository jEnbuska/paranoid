import ChatMessageList from "./@components/ChatMessageList";
import ChatForm from "./@components/ChatForm";
import ChatNav from "./@components/ChatNav";
import Conditional from "~/components/Conditional";
import { useState } from "react";
import Alert from "~/components/Alert/Alert";
import { useInviteState } from "~/features/invite/hooks";
import useComponentDidMount from "~/hooks/use-component-did-mount";
import { useAbortController } from "~/hooks/use-abort-controller";
import styles from "./styles.module.css";

export default function ChatPage() {
  const { channel } = useInviteState();
  const [closed, setClosed] = useState(false);
  const { signal } = useAbortController();
  useComponentDidMount(() =>
    channel!.addEventListener("close", () => setClosed(true), { signal }),
  );
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
