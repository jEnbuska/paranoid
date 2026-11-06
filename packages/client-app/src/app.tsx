import { createBrowserRouter, RouteObject, RouterProvider } from "react-router";
import RootLayout from "~/pages/layout";
import { socketLoader } from "~/features/socket/loader";
import AppError from "~/pages/error";
import ChatLayout from "~/pages/chat/layout";
import ChatPage from "~/pages/chat/page";
import InviteCallbackContextProvider from "~/features/invite/context/InviteCallbacksContextProvider";
import LandingPage from "~/pages/page";
import JoinInvitePage from "~/pages/join/[inviteId]/page.tsx";

/** Component playground, only in development. Vite drops it from the build */
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [{ path: "/playground/*", lazy: () => import("~/playground") }]
  : [];

const router = createBrowserRouter([
  {
    Component: RootLayout,
    ErrorBoundary: AppError,
    children: [
      {
        loader: socketLoader,
        path: "/",
        Component: InviteCallbackContextProvider,
        children: [
          {
            index: true,
            Component: LandingPage,
          },
          {
            path: "/join/:inviteId",
            Component: JoinInvitePage,
          },
        ],
      },
      {
        path: "/chat",
        Component: ChatLayout,
        children: [{ index: true, Component: ChatPage }],
      },

      ...devRoutes,
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
