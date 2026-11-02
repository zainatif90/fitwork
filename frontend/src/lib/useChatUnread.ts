/**
 * Unread Team Chat messages for the sidebar badge.
 * Asks the server every 30 s while the tab is visible, and again after every page change.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { api } from "./api";

const POLL_MS = 30000;
/** The chat page sends this event with the new total whenever it reloads, so the badge updates at once. */
export const CHAT_UNREAD_EVENT = "fitwork:chat-unread";

export function useChatUnread(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const location = useLocation();

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const check = () => {
      if (document.visibilityState !== "visible") return;
      api<{ unread: number }>("/agency/chat/unread").then((r) => setCount(r.unread)).catch(() => undefined);
    };
    const onTotal = (e: Event) => setCount((e as CustomEvent<number>).detail);
    check();
    const id = window.setInterval(check, POLL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener(CHAT_UNREAD_EVENT, onTotal);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener(CHAT_UNREAD_EVENT, onTotal);
    };
  }, [enabled, location.pathname, location.search]);

  return count;
}
