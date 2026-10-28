import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AuthLayout } from "../components/AuthLayout";
import { Alert, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { user, reloadUser } = useAuth();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // React StrictMode runs effects twice in dev
    started.current = true;
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("This link is missing its token.");
      return;
    }
    api<{ message: string }>("/auth/verify", { query: { token } })
      .then(() => {
        setState("ok");
        if (user) void reloadUser();
      })
      .catch((err) => {
        setState("error");
        setMessage(err instanceof ApiError ? err.message : "Verification failed.");
      });
  }, [params, user, reloadUser]);

  return (
    <AuthLayout title="Email verification" subtitle="Confirming your email address.">
      {state === "loading" && <Spinner />}
      {state === "ok" && <Alert tone="success">Your email is verified. You're all set.</Alert>}
      {state === "error" && <Alert tone="error">{message}</Alert>}
      <Link to={user ? "/app" : "/login"} className="mt-6 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
        {user ? "Go to dashboard →" : "Go to login →"}
      </Link>
    </AuthLayout>
  );
}
