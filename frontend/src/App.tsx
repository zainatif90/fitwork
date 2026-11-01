import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { GuestRoute, ProtectedRoute } from "./components/ProtectedRoute";
import { FullPageSpinner } from "./components/ui";
import AcceptInvite from "./pages/AcceptInvite";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import JobDetail from "./pages/JobDetail";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import VerifyEmail from "./pages/VerifyEmail";

// The chart pages pull in Recharts (large), so they are loaded only when opened.
const Agency = lazy(() => import("./pages/Agency"));
const SkillGap = lazy(() => import("./pages/SkillGap"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
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
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
