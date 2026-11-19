import { PropsWithChildren, useMemo } from "react";
import { InviteContextStateData } from "~/features/invite/types";
import useUpdateState from "~/hooks/use-update-state";
import { defaultInviteContextState } from "~/features/invite/constants";
import InviteStateContext from "./InviteStateContext";
import { useChatExits } from "~/features/misc/hooks.ts";
import { useAbortableEffect } from "~/hooks/use-abortable-effect.ts";

export default function InviteStateContextProvider({
  children,
}: PropsWithChildren) {
  const chatExists = useChatExits();
  const [state, updateState, getState] = useUpdateState<InviteContextStateData>(
    defaultInviteContextState,
    [chatExists],
  );
  // The error page replaces this, so a connection that failed is closed, and
  // the peer learns at once that it's over
  useAbortableEffect((signal) => {
    signal.addEventListener("abort", () => {
      const { channel, connection } = getState();
      channel?.close();
      connection?.close();
    });
  }, []);
  const value = useMemo(() => {
    return { state, updateState, getState };
  }, [state]);
  return (
    <InviteStateContext.Provider value={value}>
      {children}
    </InviteStateContext.Provider>
  );
}
