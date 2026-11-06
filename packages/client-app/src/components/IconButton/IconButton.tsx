import { ComponentProps } from "react";
import styles from "./styles.module.css";

type OwnProps = Omit<ComponentProps<"button">, "className"> & {
  "aria-label": string;
};
/** Square native button holding only an icon, so it needs an aria-label */
export default function IconButton({ type = "button", ...rest }: OwnProps) {
  return <button type={type} className={styles.iconButton} {...rest} />;
}
