/** Matches dashboard (UC-3): top 5 jobs with Match Score, reason and skills, plus quick stats. */
import { Briefcase, ClipboardPaste, Gauge, Radar, RefreshCw, Sparkles, Target, UserCog } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";

import { AddJobModal } from "../components/AddJobModal";
import { JobCard } from "../components/MatchParts";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sourceName, timeAgo } from "../lib/format";
import type { MatchesResponse } from "../lib/types";

type State =
  | { kind: "loading" }
  | { kind: "no-profile" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MatchesResponse };

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const justSaved = (location.state as { profileSaved?: boolean } | null)?.profileSaved;

  const load = useCallback(async (refresh = false) => {
    try {
      const data = await api<MatchesResponse>("/matches", { query: refresh ? { refresh: "true" } : undefined });
      setState({ kind: "ready", data });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setState({ kind: "no-profile" });
      else setState({ kind: "error", message: err instanceof ApiError ? err.message : "Could not load matches." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  const firstName = user?.full_name.split(" ")[0] ?? "";

  if (state.kind === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (state.kind === "no-profile") {
    return (
      <>
        <PageHeader title={`Welcome, ${firstName}`} subtitle="Let's find jobs that fit you." />
        <EmptyState icon={<UserCog className="h-6 w-6" />} title="Complete your profile first">
          FitWork needs your skills to find matching jobs.{" "}
          <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">Set up your profile →</Link>
        </EmptyState>
      </>
    );
  }

  const data = state.kind === "ready" ? state.data : null;
  const matches = data?.matches ?? [];

  return (
    <>
      <PageHeader
        title="Your top matches"
        subtitle={data ? `Updated ${timeAgo(data.generated_at)} · ranked from ${data.stats.candidates_considered} closest jobs` : undefined}
        actions={
          <>
            <Button variant="secondary" icon={<ClipboardPaste className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              Paste a job
            </Button>
            <Button onClick={onRefresh} loading={refreshing} icon={<RefreshCw className="h-4 w-4" />}>
              Refresh matches
            </Button>
          </>
        }
      />

      {justSaved && <Alert tone="success" className="mb-6">Profile saved. Your matches are now based on your new profile.</Alert>}
      {state.kind === "error" && <Alert tone="error" className="mb-6">{state.message}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <section className="space-y-4" aria-label="Matched jobs">
          {matches.length > 0 ? (
            matches.map((m, i) => <JobCard key={m.job_id} match={m} rank={i + 1} />)
          ) : (
            state.kind === "ready" && (
              <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No matching jobs right now">
                New jobs arrive every 30 minutes. Meanwhile, the{" "}
                <Link to="/app/skill-gap" className="font-medium text-brand-600 hover:underline">Skill Gap Radar</Link>{" "}
                shows which skill would unlock the most jobs for you.
              </EmptyState>
            )
          )}
        </section>

        <aside className="space-y-4">
          <Card className="space-y-5 p-5">
            <h2 className="text-sm font-semibold text-slate-900">Quick stats</h2>
            <Stat icon={<Target className="h-4 w-4" />} label="Strong matches" value={data?.stats.strong_matches ?? 0} hint="Score 75+ among the closest jobs" />
            <Stat icon={<Gauge className="h-4 w-4" />} label="Average score" value={data?.stats.average_score ?? 0} hint="Across your top 5" />
            <Stat icon={<Briefcase className="h-4 w-4" />} label="Top source" value={sourceName(data?.stats.top_source ?? null)} />
          </Card>
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-brand-600" /> How the Match Score works
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li><span className="font-medium text-slate-900">70%</span> skill & meaning similarity (NLP)</li>
              <li><span className="font-medium text-slate-900">15%</span> budget fit with your hourly rate</li>
              <li><span className="font-medium text-slate-900">15%</span> how recently it was posted</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">It's a fit score, not a promise you will win the job.</p>
          </Card>
          <Link to="/app/skill-gap" className="block">
            <Card className="flex items-center gap-3 p-4 transition hover:border-brand-200">
              <Radar className="h-5 w-5 text-brand-600" />
              <div className="text-sm">
                <p className="font-medium text-slate-900">Skill Gap Radar</p>
                <p className="text-slate-500">Find the skill that unlocks more jobs</p>
              </div>
            </Card>
          </Link>
        </aside>
      </div>

      <AddJobModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
