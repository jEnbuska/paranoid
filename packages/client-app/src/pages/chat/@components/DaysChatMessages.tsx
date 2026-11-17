import { toSimpleDate } from "~/features/date/utils";
import ChatTextMessage from "~/pages/chat/@components/ChatTextMessage";
import { Message } from "~/features/message/types";
import styles from "./styles.module.css";

type OwnProps = {
  date: string;
  messages: Message[];
};
export default function DaysChatMessages({ messages, date }: OwnProps) {
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
              isSender={message.createdBy === "self"}
              data={message.data}
              createdAt={message.createdAt}
            />
          ))}
        </ul>
      </li>
    </ul>
  );
}
