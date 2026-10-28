/** Job detail: full description, Match Score breakdown, feedback, and the proposal assistant. */
import clsx from "clsx";
import { ArrowLeft, CheckCircle2, Clock, DollarSign, ExternalLink, MapPin, MessageSquare, ThumbsDown, Trophy, XCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PlatformBadge, ScoreBar, SkillChips } from "../components/MatchParts";
import { ProposalPanel } from "../components/ProposalPanel";
import { Alert, Card, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { formatBudget, scoreTone, timeAgo } from "../lib/format";
import type { JobDetail as JobDetailData, Outcome } from "../lib/types";

function BreakdownRow({ label, value, weight, note }: { label: string; value: number; weight: number; note: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {Math.round(value * 100)}/100 × {Math.round(weight * 100)}% = <span className="font-semibold text-slate-900">{(value * weight * 100).toFixed(1)}</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${value * 100}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

const OUTCOMES: { value: Outcome; label: string; icon: ReactNode }[] = [
  { value: "applied", label: "Applied", icon: <CheckCircle2 className="h-4 w-4" /> },
  { value: "won", label: "Won", icon: <Trophy className="h-4 w-4" /> },
  { value: "lost", label: "Lost", icon: <XCircle className="h-4 w-4" /> },
  { value: "not_relevant", label: "Not relevant", icon: <ThumbsDown className="h-4 w-4" /> },
];

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<JobDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingOutcome, setSavingOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    api<JobDetailData>(`/jobs/${id}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this job."));
  }, [id]);

  async function sendFeedback(outcome: Outcome) {
    setSavingOutcome(outcome);
    try {
      await api(`/matches/${id}/feedback`, { method: "POST", body: { outcome } });
      setData((d) => (d ? { ...d, feedback: outcome } : d));
    } finally {
      setSavingOutcome(null);
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { job, match } = data;
  const tone = match ? scoreTone(match.score) : null;

  return (
    <div className="space-y-6">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <PlatformBadge source={job.source} url={job.url} />
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />Posted {timeAgo(job.posted_at)}</span>
              {job.proposals_count != null && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{job.proposals_count} proposals</span>}
              {job.client_country && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.client_country}</span>}
              {!job.is_active && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">No longer active</span>}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{job.title}</h1>
            <p className="mt-2 inline-flex items-center gap-1 font-medium text-slate-700">
              <DollarSign className="h-4 w-4 text-slate-400" />
              {formatBudget(job)}
            </p>
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Open on platform <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <hr className="my-6 border-slate-100" />
            <h2 className="text-sm font-semibold text-slate-900">Description</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">{job.description}</p>
            {job.skills.length > 0 && (
              <>
                <h2 className="mt-6 text-sm font-semibold text-slate-900">Skills</h2>
                <div className="mt-2">
                  <SkillChips matched={match?.matched_skills ?? []} missing={match ? match.missing_skills : job.skills} max={30} />
                </div>
              </>
            )}
          </Card>

          <ProposalPanel jobId={job.id} />
        </div>

        <aside className="space-y-6">
          {match && tone ? (
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Match Score</h2>
                <span className={clsx("rounded-md px-2 py-0.5 text-xs font-medium", tone.bg, tone.text)}>{tone.label}</span>
              </div>
              <div className="mt-3">
                <ScoreBar score={match.score} size="lg" />
              </div>
              <p className="mt-3 text-sm text-slate-600">{match.reason}.</p>
              <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
                <BreakdownRow label="Semantic similarity" value={match.breakdown.semantic} weight={match.breakdown.weights.semantic}
                  note={`Cosine similarity ${match.breakdown.cosine.toFixed(2)}, calibrated to 0–100`} />
                <BreakdownRow label="Budget fit" value={match.breakdown.budget_fit} weight={match.breakdown.weights.budget_fit}
                  note={match.breakdown.budget_known ? "Compared with your hourly rate" : "Budget unknown — neutral value"} />
                <BreakdownRow label="Recency" value={match.breakdown.recency} weight={match.breakdown.weights.recency}
                  note={job.source === "freelancer" || job.source === "upwork" ? "Newer jobs get fewer competing proposals" : "Not a live job — neutral value"} />
              </div>
            </Card>
          ) : (
            <Card className="p-5 text-sm text-slate-600">
              <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">Complete your profile</Link> to see your Match Score.
            </Card>
          )}

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-900">What happened with this job?</h2>
            <p className="mt-1 text-xs text-slate-500">Your answers are stored to train a better model in the future.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => sendFeedback(o.value)}
                  disabled={savingOutcome !== null}
                  className={clsx(
                    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
                    data.feedback === o.value ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  {o.icon} {o.label}
                </button>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
