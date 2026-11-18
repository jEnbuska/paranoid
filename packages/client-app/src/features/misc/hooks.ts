import { useRef } from "react";
import { useLocation } from "react-router";

export function useChatExits(): number {
  const chatExits = useRef(0);
  const { pathname } = useLocation();
  const prevPathname = useRef(pathname);
  if (prevPathname.current === "/chat" && pathname !== "/chat") {
    chatExits.current++;
  }
  prevPathname.current = pathname;
  return chatExits.current;
}
