import { createContext } from "react";
import throwOnAccess from "shared-lib/utils/throw-on-access";
import { Message } from "~/features/message/types.ts";

const MessageContext =
  createContext(
    throwOnAccess<{
      messages: Message[];
      sendMessage(text: string): Promise<void>;
    }>(),
  );

export default MessageContext;
// Provider in MessageContextProvider.tsx
