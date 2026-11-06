import { PropsWithChildren, useMemo } from "react";
import { MessageStateData } from "~/features/message/types";
import { useInviteState } from "~/features/invite/hooks";
import useUpdateState from "~/hooks/use-update-state";
import { Navigate } from "react-router";
import MessageStateContext from "./MessageStateContext";

export default function MessageStateContextProvider({
  children,
}: PropsWithChildren) {
  const inviteState = useInviteState();
  const [state, updateState, getState] = useUpdateState<MessageStateData>(
    () => ({ messages: [] }),
  );
  const value = useMemo(
    () => ({ state, updateState, getState }),
    [state, updateState, getState],
  );
  if (inviteState.stage !== "connected") {
    return <Navigate to={"/"} replace />;
  }
  return (
    <MessageStateContext.Provider value={value}>
      {children}
    </MessageStateContext.Provider>
  );
}
