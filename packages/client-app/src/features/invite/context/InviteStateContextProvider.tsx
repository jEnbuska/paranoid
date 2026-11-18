import { PropsWithChildren, useMemo } from "react";
import { InviteContextStateData } from "~/features/invite/types";
import useUpdateState from "~/hooks/use-update-state";
import { defaultInviteContextState } from "~/features/invite/constants";
import InviteStateContext from "./InviteStateContext";
import { useChatExits } from "~/features/misc/hooks.ts";

export default function InviteStateContextProvider({
  children,
}: PropsWithChildren) {
  const chatExists = useChatExits();
  const [state, updateState, getState] = useUpdateState<InviteContextStateData>(
    defaultInviteContextState,
    [chatExists],
  );
  const value = useMemo(() => {
    return { state, updateState, getState };
  }, [state]);
  return (
    <InviteStateContext.Provider value={value}>
      {children}
    </InviteStateContext.Provider>
  );
}
