import classNames from "classnames";
import { ComponentProps } from "react";
import {
  ErrorOutlineIcon,
  InfoOutlinedIcon,
  WarningAmberIcon,
} from "~/components/Icon/icons";
import styles from "./styles.module.css";

const icons = {
  error: ErrorOutlineIcon,
  warning: WarningAmberIcon,
  info: InfoOutlinedIcon,
};

type OwnProps = ComponentProps<"div"> & {
  severity?: keyof typeof icons;
};
/** Status message. The icon tells the severity apart */
export default function Alert({
  severity = "info",
  className,
  children,
  ...rest
}: OwnProps) {
  const Icon = icons[severity];
  return (
    <div
      role={severity === "error" || severity === "warning" ? "alert" : "status"}
      className={classNames(styles.alert, className)}
      {...rest}
    >
      <Icon />
      <div className={styles.message}>{children}</div>
    </div>
  );
}
