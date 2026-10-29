import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, Button, Field, Input } from "../components/ui";
import { api, ApiError } from "../lib/api";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } });
      setSent(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Forgot your password?" subtitle="We'll email you a link to choose a new one.">
      {sent ? (
        <Alert tone="success">{sent} Check your inbox (and spam folder). The link is valid for 1 hour.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">Back to log in</Link>
      </p>
    </AuthLayout>
  );
}
