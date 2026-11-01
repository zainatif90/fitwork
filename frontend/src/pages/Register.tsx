import clsx from "clsx";
import { Building2, User as UserIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, Button, Field, Input } from "../components/ui";
import { ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

type AccountType = "freelancer" | "agency_owner";

const accountTypes: { value: AccountType; label: string; text: string; icon: typeof UserIcon }[] = [
  { value: "freelancer", label: "Solo Freelancer", text: "Find jobs for yourself", icon: UserIcon },
  { value: "agency_owner", label: "Agency Owner", text: "Route jobs to your team", icon: Building2 },
];

interface Errors {
  full_name?: string;
  email?: string;
  password?: string;
}

function validate(fullName: string, email: string, password: string): Errors {
  const errors: Errors = {};
  if (fullName.trim().length < 2) errors.full_name = "Please enter your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Please enter a valid email address.";
  if (password.length < 8) errors.password = "Use at least 8 characters.";
  else if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) errors.password = "Use at least one letter and one number.";
  return errors;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // When the user arrives from an agency invite link we send them back there after sign-up
  // (they join as a member, so no account type choice). Any other page: normal sign-up + onboarding.
  const rawFrom = (location.state as { from?: string } | null)?.from;
  const from = rawFrom?.startsWith("/invite/") ? rawFrom : undefined;

  const [role, setRole] = useState<AccountType>("freelancer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(fullName, email, password);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      await register({ email, password, full_name: fullName.trim(), role });
      navigate(from ?? "/onboarding", { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than two minutes.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}

        {!from && (
          <div role="radiogroup" aria-label="Account type" className="grid grid-cols-2 gap-3">
            {accountTypes.map(({ value, label, text, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={role === value}
                onClick={() => setRole(value)}
                className={clsx(
                  "rounded-xl border p-3 text-left transition",
                  role === value ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20" : "border-slate-200 bg-white hover:border-slate-300",
                )}
              >
                <Icon className={clsx("mb-2 h-5 w-5", role === value ? "text-brand-600" : "text-slate-400")} />
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <p className="text-xs text-slate-500">{text}</p>
              </button>
            ))}
          </div>
        )}

        <Field label="Full name" htmlFor="full_name" error={errors.full_name}>
          <Input id="full_name" autoComplete="name" value={fullName} invalid={!!errors.full_name} onChange={(e) => setFullName(e.target.value)} placeholder="Ayesha Malik" />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} invalid={!!errors.email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password} hint="At least 8 characters, with a letter and a number.">
          <Input id="password" type="password" autoComplete="new-password" value={password} invalid={!!errors.password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" state={location.state} className="font-medium text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
