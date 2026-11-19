import { Navigate, Outlet } from "react-router";
import { useInviteState } from "~/features/invite/hooks.ts";

export default function ChatLayout() {
  const { channel, connection } = useInviteState();
  if (!channel || !connection) return <Navigate to={"/"} replace />;
  return <Outlet />;
}
