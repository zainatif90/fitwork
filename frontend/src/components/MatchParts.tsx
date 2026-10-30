/** Small pieces used on the matches list and the job detail page. */
import clsx from "clsx";
import { Clock, DollarSign, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

import { formatBudget, platformLabel, scoreTone, timeAgo } from "../lib/format";
import type { JobSource, Match } from "../lib/types";
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

export function JobCard({ match, rank }: { match: Match; rank: number }) {
  const { job } = match;
  return (
    <Card className="group p-5 transition hover:border-brand-200 hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">{rank}</span>
            <PlatformBadge source={job.source} url={job.url} />
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(job.posted_at)}</span>
            {job.proposals_count != null && (
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{job.proposals_count} proposals</span>
            )}
          </div>
          <Link to={`/app/jobs/${job.id}`} className="block text-base font-semibold text-slate-900 group-hover:text-brand-700">
            {job.title}
          </Link>
          <p className="mt-1 flex items-center gap-1 text-sm font-medium text-slate-700">
            <DollarSign className="h-3.5 w-3.5 text-slate-400" />
            {formatBudget(job)}
          </p>
        </div>
        <div className="w-full sm:w-auto sm:text-right">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Match Score</p>
          <ScoreBar score={match.score} />
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">{match.reason}.</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <SkillChips matched={match.matched_skills} missing={match.missing_skills} />
        <Link to={`/app/jobs/${job.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          View details →
        </Link>
      </div>
    </Card>
  );
}
