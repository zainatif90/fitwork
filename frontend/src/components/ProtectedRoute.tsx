import { useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../lib/auth";
import type { Role } from "../lib/types";
import { FullPageSpinner } from "./ui";

/** Shows children only to logged-in users (optionally only to certain roles). */
export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner />;
  if (status === "anonymous" || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

/**
 * For login/register pages: users who were ALREADY logged in when they opened the page go
 * straight to the app. Users who log in or register on this page are navigated by the page
 * itself (e.g. register -> /onboarding); redirecting here as well would race with that.
 */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const authedOnArrival = useRef<boolean | null>(null);
  if (status !== "loading" && authedOnArrival.current === null) {
    authedOnArrival.current = status === "authenticated";
  }
  if (status === "loading") return <FullPageSpinner />;
  if (authedOnArrival.current) return <Navigate to={from ?? "/app"} replace />;
  return <>{children}</>;
}
