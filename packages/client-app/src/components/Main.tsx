import { ComponentProps } from "react";
import styles from "./layout.module.css";

export default function Main(props: Omit<ComponentProps<"main">, "className">) {
  return <main {...props} className={styles.main} />;
}
