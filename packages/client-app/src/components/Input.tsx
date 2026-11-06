import { ComponentProps } from "react";
import { useAbstractFormFieldContext } from "~/components/AbstractFormField/AbstractFormFieldContext";

type OwnProps = Omit<ComponentProps<"input">, "id">;
/**
 * <input> inside an AbstractFormField. Takes its id, required, disabled and
 * ARIA state from the field.
 */
export function Input(props: OwnProps) {
  const { id, descriptionId, state, required, disabled } =
    useAbstractFormFieldContext();
  return (
    <input
      id={id}
      required={required}
      disabled={disabled}
      aria-invalid={state === "error" || undefined}
      aria-describedby={descriptionId}
      {...props}
    />
  );
}
