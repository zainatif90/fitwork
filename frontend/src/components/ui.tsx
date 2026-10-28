/** Small reusable UI building blocks so every page looks consistent. */
import clsx from "clsx";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-600/60",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const sizes = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-11 px-5 text-base" };

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70",
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
  "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-brand-500/30";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={clsx(inputBase, "h-10", invalid ? "border-red-400" : "border-slate-300 focus:border-brand-500", className)}
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
  return <div className={clsx("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
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
    <div role={tone === "error" ? "alert" : "status"} className={clsx("flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm", s.box, className)}>
      <span className="mt-0.5">{s.icon}</span>
      <div>{children}</div>
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", className ?? "bg-slate-100 text-slate-700")}>
      {children}
    </span>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#fff" : "#4f46e5"} />
        <path d="M10 9h12v3.2h-8.4v3.4h7.2v3.2h-7.2V23H10z" fill={light ? "#4f46e5" : "#fff"} />
      </svg>
      <span className={clsx("text-lg font-semibold tracking-tight", light ? "text-white" : "text-slate-900")}>FitWork</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">{icon}</div>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}
