import { toSimpleDate } from "~/features/date/utils";
import ChatTextMessage from "~/pages/chat/@components/ChatTextMessage";
import { MessageData } from "~/features/message/types";
import { useInviteState } from "~/features/invite/hooks";
import styles from "./styles.module.css";

type OwnProps = {
  date: string;
  messages: MessageData[];
};
export default function DaysChatMessages({ messages, date }: OwnProps) {
  const { userId } = useInviteState();
  return (
    <ul className={styles.day}>
      <li className={styles.dayDate}>
        <small>{toSimpleDate(date)}</small>
      </li>
      <li>
        <ul className={styles.dayMessages}>
          {messages.map((message) => (
            <ChatTextMessage
              key={message.id}
              isSender={userId === message.createdBy}
              data={message.data}
              createdAt={message.createdAt}
            />
          ))}
        </ul>
      </li>
    </ul>
  );
}
