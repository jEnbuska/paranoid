import { InviteContextCallbacks } from "~/features/invite/types";
import { createContext } from "react";
import throwOnAccess from "shared-lib/utils/throw-on-access";

const InviteCallbacksContext =
  createContext(throwOnAccess<InviteContextCallbacks>());

export default InviteCallbacksContext;
// Provider moved to InviteCallbacksContextProvider.tsx
