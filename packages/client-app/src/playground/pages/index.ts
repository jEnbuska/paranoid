import { ComponentType } from "react";
import ButtonPage from "./ButtonPage";
import IconButtonPage from "./IconButtonPage";
import TextFieldPage from "./TextFieldPage";
import PasswordFieldPage from "./PasswordFieldPage";
import FormFieldPage from "./FormFieldPage";
import FieldsetPage from "./FieldsetPage";
import AlertPage from "./AlertPage";
import SpinnerPage from "./SpinnerPage";
import StepperPage from "./StepperPage";
import DialogPage from "./DialogPage";
import ToastPage from "./ToastPage";
import IconsPage from "./IconsPage";

export const pages: Array<{
  path: string;
  title: string;
  Component: ComponentType;
}> = [
  { path: "button", title: "Button", Component: ButtonPage },
  { path: "icon-button", title: "IconButton", Component: IconButtonPage },
  { path: "text-field", title: "FormTextField", Component: TextFieldPage },
  {
    path: "password-field",
    title: "FormPasswordField",
    Component: PasswordFieldPage,
  },
  { path: "form-field", title: "AbstractFormField", Component: FormFieldPage },
  { path: "fieldset", title: "Fieldset", Component: FieldsetPage },
  { path: "alert", title: "Alert", Component: AlertPage },
  { path: "spinner", title: "Spinner", Component: SpinnerPage },
  { path: "stepper", title: "Stepper", Component: StepperPage },
  { path: "dialog", title: "Dialog", Component: DialogPage },
  { path: "toast", title: "Toast", Component: ToastPage },
  { path: "icons", title: "Icons", Component: IconsPage },
];
