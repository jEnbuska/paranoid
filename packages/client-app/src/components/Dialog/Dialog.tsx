import { ReactNode, useId, useRef } from "react";
import useComponentDidMount from "~/hooks/use-component-did-mount";
import styles from "./styles.module.css";

type OwnProps = {
  /** Called when the user dismisses the dialog (Escape or click outside) */
  onClose(): void;
  title: string;
  children: ReactNode;
};

/** Modal native <dialog>, open for as long as it's rendered */
export default function Dialog({ onClose, title, children }: OwnProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useComponentDidMount(() => ref.current?.showModal());
  return (
    <dialog
      ref={ref}
      closedby="any"
      aria-labelledby={titleId}
      className={styles.dialog}
      onClose={onClose}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
