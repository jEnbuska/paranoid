type GeneralFormFieldState = "default" | "disabled" | "error";

/** What a field shares with its label, control and description */
export type GeneralFormFieldProps = {
  state: GeneralFormFieldState;
  /** id of the control, which the label points to */
  id?: string;
  /** id of the description, set while one is shown */
  descriptionId?: string;
  required?: boolean;
  disabled?: boolean;
};
