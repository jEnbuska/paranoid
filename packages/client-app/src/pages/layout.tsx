import { Outlet } from "react-router";
import InviteStateContextProvider from "~/features/invite/context/InviteStateContextProvider";

export default function RootLayout() {
  return (
    <InviteStateContextProvider>
      <Outlet />
    </InviteStateContextProvider>
  );
}
