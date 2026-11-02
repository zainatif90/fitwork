/**
 * One routing recommendation: the job, the teammate FitWork suggests, and how every candidate compares,
 * so the owner can see WHY this person was picked before approving.
 */
import clsx from "clsx";
import { AlertTriangle, Check, ChevronDown, Clock, RotateCcw, Sparkles, UserCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../lib/auth";
import { formatBudget, scoreTone, timeAgo } from "../../lib/format";
import type { RoutingRecommendation } from "../../lib/types";
import { PlatformBadge, ScoreRing } from "../MatchParts";
import { Badge, Button } from "../ui";
import { Avatar } from "./parts";

export function RoutingCard({ rec, onAssign }: {
  rec: RoutingRecommendation;
  onAssign: (jobId: string, memberId: string) => Promise<void>;
}) {
  const { user } = useAuth();
  const candidates = [rec.recommended, ...rec.alternatives];
  const label = (c: { member_id: string; name: string }) => (c.member_id === user?.id ? `${c.name} (you)` : c.name);
  const [choice, setChoice] = useState(rec.recommended.member_id);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = candidates.find((c) => c.member_id === choice) ?? rec.recommended;
  const isOverride = choice !== rec.recommended.member_id;

  async function assign() {
    setBusy(true);
    try {
      await onAssign(rec.job.id, choice);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={clsx(
      "group relative overflow-hidden rounded-2xl border bg-white/95 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:shadow-lift",
      rec.low_team_fit ? "border-rose-200" : "border-slate-200/80",
    )}>
      <span className={clsx("absolute inset-y-0 left-0 w-1", rec.low_team_fit ? "bg-rose-400" : "bg-brand-gradient")} />
      <div className="grid grid-cols-1 gap-5 p-5 pl-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        {/* Job */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <PlatformBadge source={rec.job.source} url={rec.job.url} />
            <span className="font-medium text-slate-700">{formatBudget(rec.job)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(rec.job.posted_at)}</span>
            {rec.rerouted_after_decline && (
              <Badge className="bg-amber-50 text-amber-700"><RotateCcw className="mr-1 h-3 w-3" /> Re-routed after decline</Badge>
            )}
            {rec.low_team_fit && (
              <Badge className="bg-rose-50 text-rose-700"><AlertTriangle className="mr-1 h-3 w-3" /> Low team fit</Badge>
            )}
          </div>
          <Link to={`/app/jobs/${rec.job.id}`} className="mt-2 block font-display text-base font-bold text-slate-900 hover:text-brand-700 sm:text-lg">
            {rec.job.title}
          </Link>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{rec.job.description_preview}</p>

          {chosen.matched_skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chosen.matched_skills.slice(0, 6).map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <Check className="h-3 w-3" /> {s}
                </span>
              ))}
            </div>
          )}
          {rec.low_team_fit && rec.missing_skills.length > 0 && (
            <p className="mt-2 text-xs text-rose-700">Nobody in the team lists: {rec.missing_skills.join(", ")}</p>
          )}
        </div>

        {/* Suggested teammate */}
        <div className="min-w-0 rounded-2xl bg-gradient-to-br from-brand-50 via-white to-fuchsia-50 p-4 ring-1 ring-brand-100">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
            <Sparkles className="h-3.5 w-3.5" /> {isOverride ? "Your choice" : "Best fit"}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Avatar id={chosen.member_id} name={chosen.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{label(chosen)}</p>
              <p className="line-clamp-2 text-xs text-slate-500">{chosen.reason}</p>
            </div>
            <ScoreRing score={chosen.score} size={52} label={false} />
          </div>

          {/* Everyone compared on one scale */}
          {candidates.length > 1 && (
            <div className="mt-3">
              <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between text-xs font-medium text-slate-600 hover:text-brand-700" aria-expanded={open}>
                Compare {candidates.length} teammates
                <ChevronDown className={clsx("h-3.5 w-3.5 transition", open && "rotate-180")} />
              </button>
              {open && (
                <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Choose who gets this job">
                  {candidates.map((c) => {
                    const tone = scoreTone(c.score);
                    const selected = c.member_id === choice;
                    return (
                      <li key={c.member_id}>
                        <button
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setChoice(c.member_id)}
                          className={clsx("flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition",
                            selected ? "bg-white shadow-sm ring-1 ring-brand-300" : "hover:bg-white/70")}
                        >
                          <Avatar id={c.member_id} name={c.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-medium text-slate-800">{label(c)}</span>
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-slate-200">
                              <span className={clsx("block h-full rounded-full", tone.bar)} style={{ width: `${c.score}%` }} />
                            </span>
                          </span>
                          <span className="w-7 text-right text-xs font-semibold tabular-nums text-slate-700">{c.score}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <Button className="mt-4 w-full" onClick={assign} loading={busy} icon={<UserCheck className="h-4 w-4" />}>
            {chosen.member_id === user?.id ? "Take this job myself" : `Assign to ${chosen.name.split(" ")[0]}`}
          </Button>
        </div>
      </div>
    </article>
  );
}
