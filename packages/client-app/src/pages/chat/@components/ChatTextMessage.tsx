import classNames from "classnames";
import { memo } from "react";
import Conditional from "~/components/Conditional";
import { toSimpleTime } from "~/features/date/utils";
import { MessageData } from "~/features/message/types";
import { useInviteState } from "~/features/invite/hooks";
import styles from "./styles.module.css";

type OwnProps = Pick<MessageData, "data" | "createdAt"> & {
  isSender: boolean;
};

const ChatTextMessage = memo(function ChatMessage({
  isSender,
  data,
  createdAt,
}: OwnProps) {
  const { peerName } = useInviteState();
  return (
    <li
      className={classNames(
        styles.message,
        isSender ? styles.sent : styles.received,
      )}
    >
      <Conditional element={"b"} shown={!isSender}>
        {peerName}
      </Conditional>
      <div className={styles.messageBody}>
        <p className={styles.messageText}>{data}</p>
        <small className={styles.messageTime}>{toSimpleTime(createdAt)}</small>
      </div>
    </li>
  );
});

export default ChatTextMessage;
