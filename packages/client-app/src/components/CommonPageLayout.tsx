import { ComponentProps } from "react";
import classNames from "classnames";
import styles from "./layout.module.css";

type OwnProps = ComponentProps<"div">;
export default function CommonPageLayout({ className, ...rest }: OwnProps) {
  return <div className={classNames(styles.pageLayout, className)} {...rest} />;
}
