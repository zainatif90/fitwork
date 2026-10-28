/** Landing page for an agency invite link: /invite/:token (user must be logged in). */
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, Button, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Profile } from "../lib/types";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const { user, reloadUser, logout } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<{ agency_name: string; invited_email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ agency_name: string; invited_email: string }>(`/agency/invite/${token}`)
      .then(setInfo)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Invalid invite link."));
  }, [token]);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api("/agency/invite/accept", { method: "POST", body: { token } });
      await reloadUser();
      const profile = await api<Profile | null>("/profile/me");
      navigate(profile ? "/app/agency" : "/onboarding", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept the invite.");
    } finally {
      setBusy(false);
    }
  }

  const wrongAccount = info && user && info.invited_email !== user.email;

  return (
    <AuthLayout title="Join an agency" subtitle="You've been invited to a team on FitWork.">
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {!info && !error && <Spinner />}
      {info && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Users className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold text-slate-900">{info.agency_name}</p>
              <p className="text-sm text-slate-500">Invite for {info.invited_email}</p>
            </div>
          </div>
          {wrongAccount ? (
            <>
              <Alert tone="error">You're logged in as {user?.email}. Log in as {info.invited_email} to accept.</Alert>
              <Button variant="secondary" className="w-full" onClick={async () => { await logout(); navigate("/login", { state: { from: `/invite/${token}` } }); }}>
                Switch account
              </Button>
            </>
          ) : (
            <Button className="w-full" size="lg" onClick={accept} loading={busy}>Accept and join</Button>
          )}
        </div>
      )}
    </AuthLayout>
  );
}
