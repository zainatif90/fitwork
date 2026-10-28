import { Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "./components/AppLayout";
import { GuestRoute, ProtectedRoute } from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import JobDetail from "./pages/JobDetail";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Placeholder from "./pages/Placeholder";
import Register from "./pages/Register";
import Settings from "./pages/Settings";
import VerifyEmail from "./pages/VerifyEmail";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app" replace />} />
      <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
      <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
      <Route path="/verify" element={<VerifyEmail />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />

      <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="skill-gap" element={<Placeholder title="Skill Gap Radar" />} />
        <Route path="agency" element={<Placeholder title="Agency" />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}
