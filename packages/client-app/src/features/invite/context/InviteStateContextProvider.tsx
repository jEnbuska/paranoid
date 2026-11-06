import { PropsWithChildren, useMemo } from "react";
import { InviteContextStateData } from "~/features/invite/types";
import useUpdateState from "~/hooks/use-update-state";
import { defaultInviteContextState } from "~/features/invite/constants";
import InviteStateContext from "./InviteStateContext";

export default function InviteStateContextProvider({
  children,
}: PropsWithChildren) {
  const [state, updateState, getState] = useUpdateState<InviteContextStateData>(
    defaultInviteContextState,
  );
  const value = useMemo(() => {
    return { state, updateState, getState };
  }, [state, updateState, getState]);
  return (
    <InviteStateContext.Provider value={value}>
      {children}
    </InviteStateContext.Provider>
  );
}
