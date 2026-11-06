import classNames from "classnames";
import { ComponentProps } from "react";
import styles from "./styles.module.css";

type IconProps = Omit<ComponentProps<"svg">, "className"> & {
  size?: "small" | "medium";
};

export function createIcon(path: string, displayName: string) {
  function Icon({ size = "medium", ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        className={classNames(styles.icon, styles[size])}
        {...rest}
      >
        <path d={path} />
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}
