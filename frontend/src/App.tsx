import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GuestRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { FullPageSpinner } from "./components/ui";
import { useFreshVersion } from "./lib/useFreshVersion";
import AcceptInvite from "./pages/AcceptInvite";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import JobDetail from "./pages/JobDetail";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import TeamChat from "./pages/TeamChat";
import VerifyEmail from "./pages/VerifyEmail";

// The chart pages pull in Recharts (large), so they are not in the first download...
const loadAgency = () => import("./pages/Agency");
const loadSkillGap = () => import("./pages/SkillGap");
const Agency = lazy(loadAgency);
const SkillGap = lazy(loadSkillGap);

// ...but they are fetched quietly once the browser is idle after the first page, so the first click on
// Agency or Skill Gap opens at once instead of waiting for a ~120 kB download.
function preloadChartPages(): void {
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 4000 }) : setTimeout(cb, 2500);
  idle(() => { void loadSkillGap(); void loadAgency(); });
}
if (typeof window !== "undefined") window.addEventListener("load", preloadChartPages, { once: true });

export default function App() {
  useFreshVersion();
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/invite/:token" element={<ProtectedRoute><AcceptInvite /></ProtectedRoute>} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

      <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="skill-gap" element={<ErrorBoundary><Suspense fallback={<FullPageSpinner />}><SkillGap /></Suspense></ErrorBoundary>} />
        <Route path="agency" element={<ErrorBoundary><Suspense fallback={<FullPageSpinner />}><Agency /></Suspense></ErrorBoundary>} />
        <Route path="chat" element={<TeamChat />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
