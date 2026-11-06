import { createContext } from "react";
import throwOnAccess from "shared-lib/utils/throw-on-access";
import { MessageStateData } from "~/features/message/types";

const MessageStateContext =
  createContext(
    throwOnAccess<{
      state: MessageStateData;
      updateState: (partial: Partial<MessageStateData>) => Promise<void>;
      getState(): MessageStateData;
    }>(),
  );

export default MessageStateContext;
// Provider moved to MessageStateContextProvider.tsx
