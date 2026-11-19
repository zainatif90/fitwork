import { Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Alert, Button, Card, Field, Input } from "./ui";

/**
 * "Danger zone" in Settings: delete the account and all its data (DELETE /api/auth/me).
 * Two steps (open the form, then type the password) so it cannot happen by a mis-click.
 */
export function DeleteAccount({ isOwner }: { isOwner: boolean }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/auth/me", { method: "DELETE", body: { password } });
      await logout();
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Card className="border-red-200 p-6">
      <h2 className="font-semibold text-red-700">Danger zone</h2>
      <p className="mt-1 text-sm text-slate-600">
        Delete your account and everything in it: profile, match feedback, proposals and pasted jobs.
        {isOwner && " Your agency will be closed and your team members become solo freelancers."} This cannot be undone.
      </p>
      {!open ? (
        <Button variant="danger" className="mt-4" icon={<Trash2 className="h-4 w-4" />}
          onClick={() => setOpen(true)}>
          Delete my account
        </Button>
      ) : (
        <form onSubmit={submit} className="mt-4 max-w-sm space-y-3">
          <Field label="Type your password to confirm" htmlFor="delete-password">
            <Input id="delete-password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" loading={busy} disabled={!password}>
              Delete permanently
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setOpen(false); setPassword(""); setError(null); }}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
