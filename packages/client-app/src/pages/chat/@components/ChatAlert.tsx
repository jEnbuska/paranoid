import { ComponentProps } from "react";
import Alert from "~/components/Alert/Alert";
import styles from "./styles.module.css";

type OwnProps = Pick<ComponentProps<typeof Alert>, "severity" | "children">;
export default function ChatAlert({ severity, children }: OwnProps) {
  return (
    <Alert severity={severity} className={styles.chatAlert}>
      {children}
    </Alert>
  );
}
