import { ComponentProps, ReactNode } from "react";
import { AbstractFormField } from "~/components/AbstractFormField/AbstractFormField";
import { Input } from "~/components/Input";
import styles from "./styles.module.css";

type OwnProps = Omit<ComponentProps<"input">, "size" | "className" | "id"> & {
  label?: string;
  helperText?: ReactNode;
  error?: string;
  /** Content after the input, such as an icon button */
  endAdornment?: ReactNode;
};

export default function FormTextField({
  label,
  helperText,
  error,
  endAdornment,
  required,
  disabled,
  ...rest
}: OwnProps) {
  return (
    <AbstractFormField
      label={label}
      description={helperText}
      error={error}
      required={required}
      disabled={disabled}
    >
      <div className={styles.row}>
        <Input className={styles.input} {...rest} />
        {endAdornment}
      </div>
    </AbstractFormField>
  );
}
