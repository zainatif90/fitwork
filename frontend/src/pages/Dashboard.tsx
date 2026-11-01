/** Matches dashboard (UC-3): top 5 jobs with Match Score, reason and skills, plus quick stats. */
import { ArrowRight, Briefcase, ClipboardPaste, Radar, RefreshCw, Sparkles, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { AddJobModal } from "../components/AddJobModal";
import { Aurora, Tilt } from "../components/Motion";
import { Orb3D } from "../components/Orb3D";
import { JobCard } from "../components/MatchParts";
import { Alert, Card, CountUp, EmptyState, PageHeader, SkeletonList } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sourceName, timeAgo } from "../lib/format";
import type { MatchesResponse } from "../lib/types";

type State =
  | { kind: "loading" }
  | { kind: "no-profile" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: MatchesResponse };

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
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
      <>
        <div className="skeleton mb-6 h-56 rounded-3xl" />
        <SkeletonList rows={3} />
      </>
    );
  }

  if (state.kind === "no-profile") {
    return (
      <>
        <PageHeader icon={<Sparkles />} title={`Welcome, ${firstName}`} subtitle="Let's find jobs that fit you." />
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
      {/* Welcome banner with the key numbers */}
      <div className="bg-hero relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8">
        <Aurora />
        <Orb3D size={220} className="absolute -right-10 -bottom-16 hidden opacity-90 lg:block" />
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_right,black_10%,transparent_70%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-brand-200">{greeting()}, {firstName}</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Your <span className="text-gradient-animated">top matches</span></h1>
            {data && (
              <p className="mt-2 text-sm text-slate-300">
                Updated {timeAgo(data.generated_at)} · ranked from the {data.stats.candidates_considered} jobs closest to your profile
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAddOpen(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-medium backdrop-blur hover:bg-white/15">
              <ClipboardPaste className="h-4 w-4" /> Paste a job
            </button>
            <button onClick={onRefresh} disabled={refreshing}
              className="shine inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 shadow transition hover:-translate-y-0.5 hover:bg-brand-50 disabled:opacity-70">
              <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh matches
            </button>
          </div>
        </div>
        <div className="relative mt-7 grid grid-cols-3 gap-3 sm:max-w-2xl">
          {[
            { label: "Strong matches", value: <CountUp value={data?.stats.strong_matches ?? 0} />, hint: "score 75+" },
            { label: "Average top-5 score", value: <CountUp value={data?.stats.average_score ?? 0} decimals={1} />, hint: "out of 100" },
            { label: "Top source", value: sourceName(data?.stats.top_source ?? null), hint: "for your top 5" },
          ].map((s) => (
            <Tilt key={s.label} max={14}>
            <div className="animate-pop-in h-full rounded-2xl border border-white/15 bg-white/[0.08] p-3 shadow-xl transition hover:bg-white/[0.14] sm:p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{s.label}</p>
              <p className={`mt-1 truncate font-display font-bold ${typeof s.value === "string" ? "text-base sm:text-xl" : "text-lg sm:text-2xl"}`}
                title={typeof s.value === "string" ? s.value : undefined}>{s.value}</p>
              <p className="text-[11px] text-slate-400">{s.hint}</p>
            </div>
            </Tilt>
          ))}
        </div>
      </div>

      {justSaved && <Alert tone="success" className="mb-6">Profile saved. Your matches are now based on your new profile.</Alert>}
      {state.kind === "error" && <Alert tone="error" className="mb-6">{state.message}</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <section className="stagger-children space-y-4" aria-label="Matched jobs">
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
          <Link to="/app/skill-gap" className="group block">
            <div className="shine relative overflow-hidden rounded-2xl bg-gradient-animated p-5 text-white shadow-lift transition group-hover:-translate-y-1">
              <Radar className="absolute -right-4 -top-4 h-24 w-24 animate-[spin-slow_12s_linear_infinite] text-white/15" />
              <p className="font-display font-bold">Skill Gap Radar</p>
              <p className="mt-1 text-sm text-brand-100">Find the one skill from your field that unlocks the most new jobs.</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold">Open radar <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
            </div>
          </Link>
        </aside>
      </div>

      <AddJobModal open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
