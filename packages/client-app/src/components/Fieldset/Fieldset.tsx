import { ComponentProps } from "react";
import styles from "./styles.module.css";

type OwnProps = Omit<ComponentProps<"fieldset">, "className"> & {
  legend: string;
};
/** Native <fieldset> with a legend, laying out its fields in a column */
export default function Fieldset({ legend, children, ...rest }: OwnProps) {
  return (
    <fieldset className={styles.fieldset} {...rest}>
      <legend className={styles.legend}>{legend}</legend>
      {children}
    </fieldset>
  );
}
