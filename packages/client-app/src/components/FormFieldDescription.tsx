import { PropsWithChildren } from "react";
import classNames from "classnames";
import { useAbstractFormFieldContext } from "./AbstractFormField/AbstractFormFieldContext";
import { ErrorOutlineIcon } from "~/components/Icon/icons";
import styles from "./FormFieldDescription.module.css";

type OwnProps = {
  id?: string;
};

/** Help text or error message of an AbstractFormField */
export function FormFieldDescription({
  id,
  children,
}: PropsWithChildren<OwnProps>) {
  const { state } = useAbstractFormFieldContext();
  const error = state === "error";
  return (
    <small
      id={id}
      className={classNames(styles.description, error && styles.error)}
    >
      {error && <ErrorOutlineIcon size={"small"} />}
      {children}
    </small>
  );
}
