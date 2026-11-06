import { createMessageCallbacks } from "~/features/message/utils";
import { useInviteState } from "~/features/invite/hooks";
import { useCallback, useMemo, use } from "react";
import { MessageData } from "./types";
import MessageStateContext from "./context/MessageStateContext";
import { MessageCallbacksContext } from "./context/MessageCallbacksContext";
import { useEncrypt } from "~/features/crypt/hooks";
import { asNotNil } from "shared-lib/utils/nil";

export function useMessageState() {
  return use(MessageStateContext).state;
}
export function useMessageCallbacks() {
  return use(MessageCallbacksContext);
}

export function useAddMessage() {
  const { getState, updateState } = use(MessageStateContext);
  return useCallback((message: MessageData) => {
    void updateState({ messages: [...getState().messages, message] });
  }, []);
}

export function useCreateMessageCallbacks(
  addMessage: (message: MessageData) => void,
) {
  const { userId, channel } = useInviteState();
  const encrypt = useEncrypt();
  return useMemo(
    () =>
      createMessageCallbacks({
        userId,
        channel: asNotNil(channel),
        encrypt,
        addMessage,
      }),
    [],
  );
}
