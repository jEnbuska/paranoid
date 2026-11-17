import { use, useEffect, useMemo, useRef } from "react";
import { toSimpleDate } from "~/features/date/utils";
import DaysChatMessages from "./DaysChatMessages";
import ChatAlert from "./ChatAlert";
import MessageContext from "~/features/message/context/MessageContext.ts";
import entries from "shared-lib/utils/entries";
import { Message } from "~/features/message/types";
import styles from "./styles.module.css";

export default function ChatMessageList() {
  const { messages } = use(MessageContext);
  const messagesByDay = useMemo(
    (): Array<[string, Message[]]> =>
      entries(
        messages.reduce(
          (acc: Record<string, Message[]>, message: Message) => {
            const key = toSimpleDate(message.createdAt);
            if (!acc[key]) {
              acc[key] = [];
            }
            acc[key].push(message);
            return acc;
          },
          {} as Record<string, Message[]>,
        ),
      ),
    [messages],
  );
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!messagesByDay.length) return;
    ref.current?.scrollTo({
      top: ref.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messagesByDay]);

  if (!messages?.length) {
    return <ChatAlert severity="info">No messages yet</ChatAlert>;
  }
  return (
    <ul className={styles.messageList} ref={ref}>
      {messagesByDay.map(([date, messages]) => (
        <li key={date}>
          <DaysChatMessages date={date} messages={messages} />
        </li>
      ))}
    </ul>
  );
}
