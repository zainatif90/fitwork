/** Skill Gap Radar (UC-5): which missing skill from the user's own field would unlock the most matching jobs. */
import clsx from "clsx";
import { ChevronDown, ExternalLink, GraduationCap, Radar as RadarIcon, RefreshCw, TrendingUp, UserCog } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";

import { Tilt } from "../components/Motion";
import { Alert, Button, Card, EmptyState, PageHeader } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { timeAgo } from "../lib/format";

interface Gap {
  skill: string;
  demand: number;
  jobs_unlocked: number;
  percent_increase: number | null;
  sample_jobs: { id: string; title: string; score: number }[];
}

interface SkillGapData {
  total_active_jobs: number;
  field_jobs: number;
  baseline_matches: number;
  threshold: number;
  gaps: Gap[];
  radar: { skill: string; market_demand: number; jobs: number; your_coverage: number }[];
  your_skills: { skill: string; jobs: number }[];
  coverage_message: string | null;
  analysed_skills: number;
  compute_ms: number;
  generated_at: string;
}

// Validated categorical slots 1 and 2 (see dataviz palette)
const DEMAND_COLOR = "#6366f1";
const YOU_COLOR = "#ec4899";

function learnLinks(skill: string) {
  const q = encodeURIComponent(skill);
  return [
    { label: "freeCodeCamp", href: `https://www.freecodecamp.org/news/search?query=${q}` },
    { label: "YouTube courses", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${skill} full course for beginners`)}` },
    { label: "Coursera (free)", href: `https://www.coursera.org/search?query=${q}&productTypeDescription=Free` },
  ];
}

function GapRow({ gap, rank, maxUnlocked }: { gap: Gap; rank: number; maxUnlocked: number }) {
  const [open, setOpen] = useState(rank === 1);
  return (
    <Tilt max={3}><div className="rounded-2xl border border-white/70 bg-white/70 shadow-soft ring-1 ring-brand-100/60 backdrop-blur transition duration-200 hover:shadow-lift">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 p-4 text-left" aria-expanded={open}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white shadow-glow">{rank}</span>
        <div className="min-w-0 flex-1">
          {gap.jobs_unlocked > 0 ? (
            <p className="text-sm text-slate-900">
              Add <span className="font-semibold">{gap.skill}</span> → unlocks{" "}
              <span className="font-semibold">{gap.jobs_unlocked} more job{gap.jobs_unlocked === 1 ? "" : "s"}</span>
              {gap.percent_increase != null && <span className="text-emerald-700"> (+{gap.percent_increase}%)</span>}
            </p>
          ) : (
            <p className="text-sm text-slate-900">
              Add <span className="font-semibold">{gap.skill}</span>
              <span className="text-slate-500"> · often requested in your field</span>
            </p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-animated" style={{ width: `${Math.max(6, (gap.jobs_unlocked / maxUnlocked) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-500">Asked for in {gap.demand} job{gap.demand === 1 ? "" : "s"} similar to yours</p>
        </div>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Jobs you would unlock</p>
            {gap.sample_jobs.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                None yet on its own, but jobs similar to yours keep asking for it. Combine it with other skills on this list.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {gap.sample_jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link to={`/app/jobs/${j.id}`} className="truncate text-slate-700 hover:text-brand-700">{j.title}</Link>
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 text-xs font-semibold text-emerald-700">{j.score}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Learn it for free</p>
            <ul className="mt-2 space-y-1.5">
              {learnLinks(gap.skill).map((l) => (
                <li key={l.label}>
                  <a href={l.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
                    <GraduationCap className="h-3.5 w-3.5" /> {l.label} <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div></Tilt>
  );
}

export default function SkillGap() {
  const [data, setData] = useState<SkillGapData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "no-profile" | "error">("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    try {
      setData(await api<SkillGapData>("/skill-gap", { query: refresh ? { refresh: "true" } : undefined }));
      setState("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setState("no-profile");
      else {
        setError(err instanceof ApiError ? err.message : "Could not load the skill gap analysis.");
        setState("error");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-4 text-sm text-slate-500">
        <span className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
          <span className="relative rounded-full bg-brand-gradient p-4 text-white shadow-glow"><RadarIcon className="h-7 w-7" /></span>
        </span>
        Analysing jobs in your field…
      </div>
    );
  }
  if (state === "no-profile") {
    return (
      <>
        <PageHeader icon={<RadarIcon />} title="Skill Gap Radar" />
        <EmptyState icon={<UserCog className="h-6 w-6" />} title="Complete your profile first">
          <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">Set up your profile →</Link>
        </EmptyState>
      </>
    );
  }
  if (state === "error" || !data) return <Alert tone="error">{error}</Alert>;

  const maxUnlocked = Math.max(1, ...data.gaps.map((g) => g.jobs_unlocked));

  return (
    <>
      <PageHeader
        icon={<RadarIcon />}
        title="Skill Gap Radar"
        subtitle={`Your field: the ${data.field_jobs} jobs most similar to your profile (out of ${data.total_active_jobs} active) · updated ${timeAgo(data.generated_at)}`}
        actions={
          <Button variant="secondary" loading={refreshing} icon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}>
            Recalculate
          </Button>
        }
      />

      {data.coverage_message && <Alert tone="success" className="mb-6">{data.coverage_message}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0 p-5">
          <h2 className="font-semibold text-slate-900">You vs your field</h2>
          <p className="mt-0.5 text-xs text-slate-500">Top {data.radar.length} skills requested by jobs similar to yours. Demand is scaled so the most requested skill = 100.</p>
          <div className="mt-2 h-80">
            <ResponsiveContainer>
              <RadarChart data={data.radar} outerRadius="72%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="skill" tick={{ fill: "#475569", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Market demand" dataKey="market_demand" stroke={DEMAND_COLOR} strokeWidth={2} fill={DEMAND_COLOR} fillOpacity={0.15} animationDuration={900} />
                <Radar name="Your coverage" dataKey="your_coverage" stroke={YOU_COLOR} strokeWidth={2} fill={YOU_COLOR} fillOpacity={0.1} animationDuration={900} animationBegin={250} />
                <Tooltip
                  formatter={(value, name, item) =>
                    name === "Market demand" ? [`${(item.payload as { jobs: number }).jobs} jobs`, name] : [Number(value) === 100 ? "You have it" : "Missing", name]}
                  contentStyle={{ borderRadius: 8, borderColor: "#e2e8f0", fontSize: 12, color: "#0f172a" }}
                />
                <Legend iconType="plainline" formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          {data.your_skills.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your skills in demand</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {data.your_skills.map((s) => (
                  <span key={s.skill} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {s.skill} <span className="font-semibold text-slate-900">{s.jobs}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="min-w-0 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <TrendingUp className="h-4 w-4 text-brand-600" /> Skills that unlock the most jobs
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Only skills from your own field of work. You match {data.baseline_matches} jobs today (score ≥ {data.threshold}). Each number below is measured by re-scoring every job with that skill added to your profile.
              </p>
            </div>
          </div>
          <div className="stagger-children mt-4 space-y-3">
            {data.gaps.length === 0 ? (
              <EmptyState icon={<RadarIcon className="h-6 w-6" />} title="No missing skills in your field right now">
                Check back after new jobs arrive.
              </EmptyState>
            ) : (
              data.gaps.map((g, i) => <GapRow key={g.skill} gap={g} rank={i + 1} maxUnlocked={maxUnlocked} />)
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
