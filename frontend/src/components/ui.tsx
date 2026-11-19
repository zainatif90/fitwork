/** Small reusable UI building blocks so every page looks consistent. */
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { Orb3D } from "./Orb3D";
import { forwardRef, useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-gradient-animated shine btn-3d text-white",
  secondary: "shine bg-white text-slate-800 border border-white/60 hover:-translate-y-0.5 hover:bg-brand-50 shadow-soft",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-base" };

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, error, hint, children, htmlFor }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  "w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-soft transition focus:outline-none focus:ring-4 focus:ring-brand-500/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(inputBase, "h-11", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)}
        {...rest}
      />
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={clsx(inputBase, "py-2", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)}
        {...rest}
      />
    );
  },
);

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("rounded-2xl border border-white/70 bg-white/[0.97] shadow-soft ring-1 ring-brand-100/60", className)}>{children}</div>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-brand-600", className ?? "h-6 w-6")} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

type AlertTone = "error" | "success" | "info";
const alertStyles: Record<AlertTone, { box: string; icon: ReactNode }> = {
  error: { box: "border-red-200 bg-red-50 text-red-800", icon: <AlertCircle className="h-4 w-4 shrink-0" /> },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: <CheckCircle2 className="h-4 w-4 shrink-0" /> },
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: <Info className="h-4 w-4 shrink-0" /> },
};

export function Alert({ tone = "info", children, className }: { tone?: AlertTone; children: ReactNode; className?: string }) {
  const s = alertStyles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm", s.box, className)}>
      <span className="mt-0.5">{s.icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", className ?? "bg-slate-100 text-slate-700")}>
      {children}
    </span>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 drop-shadow-sm" aria-hidden>
        <defs>
          <linearGradient id="fw-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={light ? "#fff" : "url(#fw-logo)"} />
        <path d="M10 9h12v3.2h-8.4v3.4h7.2v3.2h-7.2V23H10z" fill={light ? "#4f46e5" : "#fff"} />
      </svg>
      <span className={clsx("font-display text-lg font-bold tracking-tight", light ? "text-white" : "text-slate-900")}>FitWork</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="bg-hero relative mb-6 flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8">
      <div className="aurora" aria-hidden><span /><span /><span /></div>
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_right,black_10%,transparent_70%)]" />
      <Orb3D size={150} className="absolute -right-6 top-1/2 hidden -translate-y-1/2 opacity-80 md:block" />
      <div className="relative flex min-w-0 items-center gap-4">
        {icon && (
          <span className="animate-pop-in animate-pulse-ring hidden shrink-0 rounded-2xl bg-brand-gradient p-3.5 text-white shadow-glow ring-1 ring-white/30 sm:inline-flex [&>svg]:h-7 [&>svg]:w-7">{icon}</span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-slate-300">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="relative flex flex-wrap items-center gap-2 md:mr-28">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/70 bg-white/90 px-6 py-16 text-center shadow-soft ring-1 ring-brand-100/60">
      <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-400/30 via-fuchsia-400/30 to-sky-400/30 blur-3xl" />
      <div className="animate-pop-in relative mb-4 rounded-2xl bg-gradient-animated p-4 text-white shadow-glow [&>svg]:h-8 [&>svg]:w-8">{icon}</div>
      <h3 className="relative font-display text-xl font-bold text-slate-900">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

/** Shimmering placeholder cards shown while a page loads. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-soft">
          <div className="flex gap-6">
            <div className="flex-1 space-y-3">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-4 w-1/4" />
              <div className="skeleton h-4 w-5/6" />
            </div>
            <div className="skeleton h-16 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Counts from 0 up to `value` when it first appears. */
export function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900);
      setShown(value * (1 - Math.pow(1 - t, 3))); // ease-out
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toFixed(decimals)}</>;
}
