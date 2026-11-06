import SignalingStateStatus from "./SignalingStateStatus.tsx";
import styles from "./styles.module.css";

import { useInviteConnectionProgress } from "~/features/invite/hooks.ts";

export default function ConnectionProgressList() {
  const progress = useInviteConnectionProgress();
  return (
    <ul className={styles.progressList}>
      {progress.map((it) => {
        return (
          <li key={it.type} className={styles.progressItem}>
            <small>{it.type}</small>
            <SignalingStateStatus progress={it} />
          </li>
        );
      })}
    </ul>
  );
}
