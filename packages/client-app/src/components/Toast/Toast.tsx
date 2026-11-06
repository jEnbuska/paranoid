import styles from "./styles.module.css";

type OwnProps = {
  text: string;
  /** Called when the toast has faded out */
  onHidden(): void;
};

/** Short status message in the top layer that fades out on its own */
export default function Toast({ text, onHidden }: OwnProps) {
  return (
    <output
      popover="manual"
      role="status"
      className={styles.toast}
      ref={(element) => element?.showPopover()}
      onAnimationEnd={onHidden}
    >
      {text}
    </output>
  );
}
