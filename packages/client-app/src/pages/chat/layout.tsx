import { Outlet } from "react-router";
import MessageStateContextProvider from "~/features/message/context/MessageStateContextProvider";
import MessageCallbacksContextProvider from "~/features/message/context/MessageCallbacksContextProvider";

export default function ChatLayout() {
  return (
    <MessageStateContextProvider>
      <MessageCallbacksContextProvider>
        <Outlet />
      </MessageCallbacksContextProvider>
    </MessageStateContextProvider>
  );
}
