import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, Button, Field, Input } from "../components/ui";
import { api, ApiError } from "../lib/api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 8 characters, with a letter and a number.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset the password.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Reset password" subtitle="">
        <Alert tone="error">This link is missing its token. Please use the link from the email.</Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="For your security, this also logs you out on other devices.">
      {done ? (
        <>
          <Alert tone="success">Your password has been changed.</Alert>
          <Link to="/login" className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">Go to log in →</Link>
        </>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number.">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm">
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Save new password
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
