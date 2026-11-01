/** Small pieces used on the matches list and the job detail page. */
import clsx from "clsx";
import { ArrowRight, Clock, DollarSign, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { formatBudget, platformLabel, scoreTone, timeAgo } from "../lib/format";
import type { JobSource, Match } from "../lib/types";
import { Tilt } from "./Motion";
import { Badge, Card } from "./ui";

export function PlatformBadge({ source, url }: { source: JobSource; url: string | null }) {
  const styles: Record<JobSource, string> = {
    freelancer: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
    upwork: "bg-green-50 text-green-700 ring-1 ring-green-200",
    himalayas: "bg-teal-50 text-teal-700 ring-1 ring-teal-200",
    remotive: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    jobicy: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    csv: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    manual: "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
    synthetic: "bg-slate-100 text-slate-500",
  };
  return <Badge className={styles[source]}>{platformLabel(source, url)}</Badge>;
}

export function ScoreBar({ score, size = "md" }: { score: number; size?: "md" | "lg" }) {
  const tone = scoreTone(score);
  return (
    <div className={clsx("flex items-center gap-3", size === "lg" ? "w-full" : "w-40")}>
      <div className={clsx("flex-1 overflow-hidden rounded-full bg-slate-100", size === "lg" ? "h-3" : "h-2")}>
        <div className={clsx("h-full rounded-full transition-all", tone.bar)} style={{ width: `${score}%` }} />
      </div>
      <span className={clsx("font-semibold tabular-nums", tone.text, size === "lg" ? "text-2xl" : "text-sm")}>{score}</span>
    </div>
  );
}

export function SkillChips({ matched, missing, max = 6 }: { matched: string[]; missing: string[]; max?: number }) {
  const shownMatched = matched.slice(0, max);
  const shownMissing = missing.slice(0, Math.max(0, max - shownMatched.length));
  const hidden = matched.length + missing.length - shownMatched.length - shownMissing.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shownMatched.map((s) => (
        <Badge key={`m-${s}`} className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">✓ {s}</Badge>
      ))}
      {shownMissing.map((s) => (
        <Badge key={`x-${s}`} className="bg-white text-slate-500 ring-1 ring-slate-200">{s}</Badge>
      ))}
      {hidden > 0 && <Badge className="bg-white text-slate-400">+{hidden} more</Badge>}
    </div>
  );
}

/** Circular Match Score: the ring fills to the score, coloured by fit (green / amber / red). */
export function ScoreRing({ score, size = 64, label = true }: { score: number; size?: number; label?: boolean }) {
  const tone = scoreTone(score);
  // The ring fills from 0 to the score when it first appears
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  const stroke = size >= 90 ? 9 : 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`Match Score ${score} out of 100, ${tone.label}`}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference * (1 - shown / 100)}
            style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s" }} />
        </svg>
        <span className={clsx("absolute inset-0 flex items-center justify-center font-display font-bold tabular-nums text-slate-900",
          size >= 90 ? "text-3xl" : "text-lg")}>{score}</span>
      </div>
      {label && <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone.bg, tone.text)}>{tone.label}</span>}
    </div>
  );
}

export function JobCard({ match, rank }: { match: Match; rank: number }) {
  const { job } = match;
  return (
    <Tilt max={4}>
    <Card className={clsx("group relative p-5 transition-shadow duration-200 hover:shadow-lift sm:p-6",
      rank === 1 ? "glow-border border-transparent" : "overflow-hidden hover:border-brand-200")}>
      {rank === 1 && (
        <span className="animate-pop-in absolute -top-3 right-5 rounded-full bg-gradient-animated px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-glow">
          Best match
        </span>
      )}
      <div className="flex gap-4 sm:gap-6">
        <div className="min-w-0 flex-1">
          <div className="mb-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className={clsx("flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold",
              rank === 1 ? "bg-brand-gradient text-white shadow-glow" : "bg-slate-100 text-slate-700")}>#{rank}</span>
            <PlatformBadge source={job.source} url={job.url} />
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(job.posted_at)}</span>
            {job.proposals_count != null && (
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{job.proposals_count} proposals</span>
            )}
          </div>
          <Link to={`/app/jobs/${job.id}`} className="block font-display text-lg font-bold leading-snug text-slate-900 group-hover:text-brand-700">
            <span className="absolute inset-0" aria-hidden />
            {job.title}
          </Link>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-700">
            <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
            {formatBudget(job)}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{match.reason}.</p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <SkillChips matched={match.matched_skills} missing={match.missing_skills} />
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition group-hover:gap-2">
              View details <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <ScoreRing score={match.score} />
        </div>
      </div>
    </Card>
    </Tilt>
  );
}
