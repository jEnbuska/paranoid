import { createContext } from "react";
import throwOnAccess from "shared-lib/utils/throw-on-access";
import { InviteContextStateData } from "~/features/invite/types";

const InviteStateContext =
  createContext(
    throwOnAccess<{
      state: InviteContextStateData;
      getState(): InviteContextStateData;
      updateState(update: Partial<InviteContextStateData>): Promise<void>;
    }>(),
  );

export default InviteStateContext;
