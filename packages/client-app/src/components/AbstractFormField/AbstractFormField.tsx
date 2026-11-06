import styles from "./styles.module.css";
import { PropsWithChildren, ReactNode, useId } from "react";
import { FormFieldLabel } from "../FormFieldLabel";
import { FormFieldDescription } from "../FormFieldDescription";
import { AbstractFormFieldContext } from "./AbstractFormFieldContext";

type OwnProps = {
  /** id of the control. Generated when not given */
  id?: string;
  label?: string;
  /** Shown at the end of the label's line, such as an `<output>` with a slider's value */
  labelEnd?: ReactNode;
  description?: ReactNode;
  /** Shown in place of the description */
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

/**
 * Label, control and description of a form field. The control (children)
 * reads its id, required, disabled and ARIA state from the context, as
 * `Input` does.
 */
export function AbstractFormField({
  children,
  id: idProp,
  label,
  labelEnd,
  description,
  error,
  required,
  disabled,
}: PropsWithChildren<OwnProps>) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const descriptionId = useId();
  const message = error ?? description;
  return (
    <div className={styles.abstractFormField}>
      <AbstractFormFieldContext.Provider
        value={{
          state: error ? "error" : disabled ? "disabled" : "default",
          id,
          descriptionId: message ? descriptionId : undefined,
          required,
          disabled,
        }}
      >
        {labelEnd ? (
          <div className={styles.labelLine}>
            {label && <FormFieldLabel>{label}</FormFieldLabel>}
            {labelEnd}
          </div>
        ) : (
          label && <FormFieldLabel>{label}</FormFieldLabel>
        )}
        {children}
        {message && (
          <FormFieldDescription id={descriptionId}>
            {message}
          </FormFieldDescription>
        )}
      </AbstractFormFieldContext.Provider>
    </div>
  );
}
