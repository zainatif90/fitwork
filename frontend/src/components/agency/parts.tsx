/** Small building blocks shared by the agency owner and member views. */
import clsx from "clsx";
import { CheckCircle2, Circle, Send, Trophy, XCircle, type LucideIcon } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

import { scoreTone } from "../../lib/format";
import type { AssignmentStatus } from "../../lib/types";

// Each person keeps the same colour everywhere (picked from their id, not their position in a list)
const AVATAR_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
];

function pick(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ id, name, size = "md", muted }: { id: string; name: string; size?: "sm" | "md" | "lg"; muted?: boolean }) {
  return (
    <span
      title={name}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm ring-2 ring-white",
        muted ? "bg-slate-300" : clsx("bg-gradient-to-br", pick(id)),
        size === "sm" && "h-7 w-7 text-[11px]",
        size === "md" && "h-10 w-10 text-sm",
        size === "lg" && "h-12 w-12 text-base",
      )}
    >
      {initials(name)}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  const tone = scoreTone(score);
  return <span className={clsx("rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", tone.bg, tone.text)}>{score}</span>;
}

export const STATUS_META: Record<AssignmentStatus, { label: string; className: string; dot: string; icon: LucideIcon }> = {
  recommended: { label: "Suggested", className: "bg-slate-100 text-slate-600", dot: "bg-slate-400", icon: Circle },
  assigned: { label: "Assigned", className: "bg-brand-50 text-brand-700", dot: "bg-brand-500", icon: Circle },
  declined: { label: "Declined", className: "bg-slate-100 text-slate-500", dot: "bg-slate-400", icon: XCircle },
  applied: { label: "Applied", className: "bg-sky-50 text-sky-700", dot: "bg-sky-500", icon: Send },
  won: { label: "Won", className: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500", icon: Trophy },
  lost: { label: "Lost", className: "bg-rose-50 text-rose-700", dot: "bg-rose-500", icon: XCircle },
};

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", meta.className)}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

/** Assigned -> Applied -> Result, so a member (and the owner) sees where each job stands. */
export function ProgressSteps({ status }: { status: AssignmentStatus }) {
  const step = status === "assigned" ? 0 : status === "applied" ? 1 : 2;
  const result = status === "won" ? "Won" : status === "lost" ? "Lost" : "Result";
  const steps = ["Assigned", "Applied", result];
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-medium" aria-label={`Progress: ${STATUS_META[status].label}`}>
      {steps.map((s, i) => {
        const done = i <= step;
        const final = i === 2 && step === 2;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span className={clsx(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              !done && "bg-slate-100 text-slate-400",
              done && !final && "bg-brand-50 text-brand-700",
              final && status === "won" && "bg-emerald-100 text-emerald-700",
              final && status === "lost" && "bg-rose-100 text-rose-700",
            )}>
              {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />} {s}
            </span>
            {i < 2 && <span className={clsx("h-px w-3 sm:w-5", i < step ? "bg-brand-300" : "bg-slate-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

/** A glassy number tile used in the agency hero banners. */
export function HeroStat({ label, value, hint, icon }: { label: string; value: ReactNode; hint: string; icon: ReactNode }) {
  return (
    <div className="animate-pop-in h-full rounded-2xl border border-white/15 bg-white/[0.08] p-3 shadow-xl transition hover:bg-white/[0.14] sm:p-4">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 sm:text-[11px] [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon} {label}
      </p>
      <p className="mt-1 truncate font-display text-lg font-bold sm:text-2xl">{value}</p>
      <p className="truncate text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

/**
 * Pill-style tab bar. Scrolls sideways on narrow phones instead of squeezing.
 * Keyboard: Left/Right arrows move between tabs, Home/End jump to the first/last (WAI-ARIA tabs pattern).
 * Wrap the content in <TabPanel> with the same idPrefix so screen readers know which tab it belongs to.
 */
export function Tabs<T extends string>({ tabs, value, onChange, idPrefix, label }: {
  tabs: { id: T; label: string; count?: number; icon: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
  label: string;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = tabs.findIndex((t) => t.id === value);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    onChange(target.id);
    document.getElementById(`${idPrefix}-tab-${target.id}`)?.focus();
  }

  return (
    <div className="-mx-1 mb-5 overflow-x-auto px-1 pb-1">
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown}
        className="inline-flex min-w-max gap-1 rounded-2xl border border-white/70 bg-white/80 p-1 shadow-soft ring-1 ring-brand-100/60 backdrop-blur">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`${idPrefix}-tab-${t.id}`}
            role="tab"
            aria-selected={value === t.id}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={value === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition [&>svg]:h-4 [&>svg]:w-4",
              value === t.id ? "bg-brand-gradient text-white shadow-glow" : "text-slate-600 hover:bg-brand-50 hover:text-brand-700",
            )}
          >
            {t.icon} {t.label}
            {t.count != null && (
              <span className={clsx("rounded-full px-1.5 text-[11px] tabular-nums", value === t.id ? "bg-white/25" : "bg-slate-100 text-slate-500")}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TabPanel({ idPrefix, value, children }: { idPrefix: string; value: string; children: ReactNode }) {
  return (
    <div key={value} id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${value}`} tabIndex={0}
      className="animate-fade-up focus:outline-none">
      {children}
    </div>
  );
}

/** "Closed" label for a job that has expired on its platform. */
export function ClosedBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-white"
      title="This job has closed on its platform and can no longer be applied to">
      Closed
    </span>
  );
}
