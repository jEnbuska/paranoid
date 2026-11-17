import { Outlet } from "react-router";
import InviteStateContextProvider from "~/features/invite/context/InviteStateContextProvider";
import MessageContextProvider from "~/features/message/context/MessageContextProvider.tsx";

export default function RootLayout() {
  return (
    <InviteStateContextProvider>
      <MessageContextProvider>
        <Outlet />
      </MessageContextProvider>
    </InviteStateContextProvider>
  );
}
