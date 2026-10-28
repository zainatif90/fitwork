import type { ReactNode } from "react";
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

/** For login/register pages: logged-in users go straight to the app. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (status === "loading") return <FullPageSpinner />;
  if (status === "authenticated") return <Navigate to={from ?? "/app"} replace />;
  return <>{children}</>;
}
