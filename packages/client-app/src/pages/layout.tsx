import { Outlet } from "react-router";
import InviteStateContextProvider from "~/features/invite/context/InviteStateContextProvider";
import MessageStateContextProvider from "~/features/message/context/MessageStateContextProvider";

export default function RootLayout() {
  return (
    <InviteStateContextProvider>
      <MessageStateContextProvider>
        <Outlet />
      </MessageStateContextProvider>
    </InviteStateContextProvider>
  );
}
