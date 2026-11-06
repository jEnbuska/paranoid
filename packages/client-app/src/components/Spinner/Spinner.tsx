import styles from "./styles.module.css";

type OwnProps = {
  label?: string;
};
/** Native indeterminate <progress> drawn as spokes, sized to sit next to text */
export default function Spinner({ label = "Loading" }: OwnProps) {
  return <progress aria-label={label} className={styles.spinner} />;
}
