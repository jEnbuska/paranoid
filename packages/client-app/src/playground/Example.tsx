import { ReactNode } from "react";
import classNames from "classnames";
import styles from "./styles.module.css";

type OwnProps = {
  title: string;
  /** Lay the children out in a wrapping row (default) or a column */
  layout?: "row" | "column";
  children: ReactNode;
};
/** One variant of a component on a playground page */
export default function Example({ title, layout = "row", children }: OwnProps) {
  return (
    <section className={styles.example}>
      <h3>{title}</h3>
      <div className={classNames(styles[layout])}>{children}</div>
    </section>
  );
}
