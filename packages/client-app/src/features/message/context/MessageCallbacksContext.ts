import { createContext } from "react";
import { MessageCallbacksData } from "../types";
import throwOnAccess from "shared-lib/utils/throw-on-access";

export const MessageCallbacksContext =
  createContext(throwOnAccess<MessageCallbacksData>());
