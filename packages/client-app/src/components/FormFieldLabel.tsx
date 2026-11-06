import { PropsWithChildren } from "react";
import { useAbstractFormFieldContext } from "~/components/AbstractFormField/AbstractFormFieldContext";

/** Label of an AbstractFormField, pointing to its control */
export function FormFieldLabel({ children }: PropsWithChildren) {
  const { id, required } = useAbstractFormFieldContext();
  return (
    <label htmlFor={id}>
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  );
}
