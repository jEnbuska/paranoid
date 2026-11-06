import { GeneralFormFieldProps } from "./types";
import { createContext, useContext } from "react";

export const AbstractFormFieldContext = createContext<GeneralFormFieldProps>({
  state: "default",
});

export const useAbstractFormFieldContext = () => {
  return useContext(AbstractFormFieldContext);
};
