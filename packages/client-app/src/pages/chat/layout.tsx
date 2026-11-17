import { Outlet } from "react-router";
import MessageCallbacksContextProvider from "~/features/message/context/MessageCallbacksContextProvider";

export default function ChatLayout() {
  return (
    <MessageCallbacksContextProvider>
      <Outlet />
    </MessageCallbacksContextProvider>
  );
}
