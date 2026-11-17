import { createContext } from "react";
import throwOnAccess from "shared-lib/utils/throw-on-access";
import { MessageStateData } from "~/features/message/types";
import type { StateUpdate } from "~/hooks/use-update-state";

const MessageStateContext =
  createContext(
    throwOnAccess<{
      state: MessageStateData;
      updateState: (update: StateUpdate<MessageStateData>) => Promise<void>;
      getState(): MessageStateData;
    }>(),
  );

export default MessageStateContext;
// Provider moved to MessageStateContextProvider.tsx
