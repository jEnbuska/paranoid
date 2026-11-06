import { useEffect, useMemo, useRef } from "react";
import { toSimpleDate } from "~/features/date/utils";
import DaysChatMessages from "./DaysChatMessages";
import ChatAlert from "./ChatAlert";
import { useMessageState } from "~/features/message/hooks";
import entries from "shared-lib/utils/entries";
import { MessageData } from "~/features/message/types";
import styles from "./styles.module.css";

export default function ChatMessageList() {
  const { messages } = useMessageState();
  const messagesByDay = useMemo(
    (): Array<[string, MessageData[]]> =>
      entries(
        messages.reduce(
          (acc: Record<string, MessageData[]>, message: MessageData) => {
            const key = toSimpleDate(message.createdAt);
            if (!acc[key]) {
              acc[key] = [];
            }
            acc[key].push(message);
            return acc;
          },
          {} as Record<string, MessageData[]>,
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
