import * as icons from "~/components/Icon/icons";
import Example from "../Example";
import styles from "../styles.module.css";

export default function IconsPage() {
  return (
    <>
      <h2>Icons</h2>
      {(["medium", "small"] as const).map((size) => (
        <Example key={size} title={size} layout={"column"}>
          <ul className={styles.iconGrid}>
            {Object.entries(icons).map(([name, Icon]) => (
              <li key={name}>
                <Icon size={size} />
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </Example>
      ))}
    </>
  );
}
