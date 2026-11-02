/**
 * Agency Mode (UC-4).
 * Owner: hero with team numbers, a setup checklist, and four tabs:
 *   Routing (who should get each job, approve or pick someone else), Pipeline (Assigned -> Applied -> Won/Lost),
 *   Team (invite, members, pending invites), Performance (win-rate chart + per-member results).
 * Member: their own job queue with progress steps, proposal link, status updates and decline.
 * Freelancer: explains Agency Mode and lets them start their own agency.
 */
import clsx from "clsx";
import {
  BarChart3, Briefcase, CheckCircle2, Circle, Crown, FileText, Inbox, KanbanSquare, Mail, MessageSquare, RefreshCw, Route,
  Send, Sparkles, Target, Trophy, UserPlus, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { HeroStat, ProgressSteps, ScorePill, StatusBadge, Tabs } from "../components/agency/parts";
import { Pipeline } from "../components/agency/Pipeline";
import { RoutingCard } from "../components/agency/RoutingCard";
import { TeamPanel } from "../components/agency/TeamPanel";
import { PlatformBadge } from "../components/MatchParts";
import { Aurora } from "../components/Motion";
import { Orb3D } from "../components/Orb3D";
import { Alert, Button, Card, CountUp, EmptyState, SkeletonList } from "../components/ui";
import { WinRateChart } from "../components/WinRateChart";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatBudget, timeAgo } from "../lib/format";
import type { Agency as AgencyData, Assignment, RoutingRecommendation, TeamStats } from "../lib/types";

/** Shared dark banner for the agency pages. */
function AgencyHero({ eyebrow, title, subtitle, actions, children }: {
  eyebrow: string; title: string; subtitle: string; actions?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="bg-hero relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-lift sm:p-8">
      <Aurora />
      <Orb3D size={200} className="absolute -bottom-14 -right-10 hidden opacity-90 lg:block" />
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_right,black_10%,transparent_70%)]" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-200"><Crown className="h-4 w-4" /> {eyebrow}</p>
          <h1 className="mt-1 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2 lg:mr-36">{actions}</div>}
      </div>
      {children && <div className="relative mt-7 grid grid-cols-2 gap-3 lg:max-w-3xl lg:grid-cols-4">{children}</div>}
    </div>
  );
}

const heroButton = "inline-flex h-10 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 text-sm font-medium backdrop-blur transition hover:bg-white/15";
const heroPrimary = "shine inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-900 shadow transition hover:-translate-y-0.5 hover:bg-brand-50 disabled:opacity-70";

// ---------------------------------------------------------------- Owner

type OwnerTab = "routing" | "pipeline" | "team" | "performance";
const OWNER_TABS: OwnerTab[] = ["routing", "pipeline", "team", "performance"];

/** The four things an owner needs before Agency Mode is useful. Hidden once all are done. */
function SetupChecklist({ agency, stats, assignments, onInvite }: {
  agency: AgencyData; stats: TeamStats; assignments: Assignment[]; onInvite: () => void;
}) {
  const steps = [
    { done: agency.members.length > 0, title: "Invite a teammate", text: "Send an invite link by email." },
    { done: stats.members.length > 0, title: "Teammate joins", text: "They open the link and join your agency." },
    { done: stats.members.length > 0 && stats.members.every((m) => m.has_profile), title: "Profiles completed", text: "Each teammate adds their skills, so FitWork can match them." },
    { done: assignments.length > 0, title: "Assign your first job", text: "Approve a suggestion in the Routing tab." },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;

  return (
    <Card className="mb-6 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">Set up your agency</h2>
          <p className="text-sm text-slate-500">{doneCount} of {steps.length} done</p>
        </div>
        {!steps[0].done && <Button onClick={onInvite} icon={<UserPlus className="h-4 w-4" />}>Invite a teammate</Button>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-gradient transition-all duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className={clsx("flex gap-3 rounded-xl p-3", s.done ? "bg-emerald-50/70" : "bg-slate-50")}>
            {s.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" />}
            <div className="min-w-0">
              <p className={clsx("text-sm font-semibold", s.done ? "text-emerald-800" : "text-slate-800")}>{i + 1}. {s.title}</p>
              <p className="text-xs text-slate-500">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function RoutingTab({ recs, hasMembers, onAssign, goToTeam }: {
  recs: RoutingRecommendation[]; hasMembers: boolean; onAssign: (jobId: string, memberId: string) => Promise<void>; goToTeam: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "strong" | "low">("all");
  const shown = recs.filter((r) => filter === "all" || (filter === "strong" ? r.recommended.score >= 75 : r.low_team_fit));
  const counts = { all: recs.length, strong: recs.filter((r) => r.recommended.score >= 75).length, low: recs.filter((r) => r.low_team_fit).length };

  if (!hasMembers) {
    return (
      <EmptyState icon={<Route className="h-6 w-6" />} title="No teammates to route jobs to yet">
        <span className="block">Invite your team first. As soon as someone joins and fills in their skills, FitWork suggests who should take each job.</span>
        <span className="mt-4 block"><Button onClick={goToTeam} icon={<UserPlus className="h-4 w-4" />}>Invite a teammate</Button></span>
      </EmptyState>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          FitWork compares every open job with every teammate's profile and suggests the <strong>best fit</strong>. Approve it, or choose someone else.
        </p>
        <div className="flex gap-1.5">
          {([["all", "All"], ["strong", "Strong fit 75+"], ["low", "Low team fit"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setFilter(id)}
              className={clsx("rounded-full px-3 py-1 text-xs font-medium transition",
                filter === id ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>
              {label} <span className="tabular-nums opacity-70">{counts[id]}</span>
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-500">
          {recs.length === 0
            ? "No open jobs fit your team right now. New jobs arrive every few hours; check back later or press Refresh."
            : "No jobs in this filter."}
        </p>
      ) : (
        <div className="stagger-children space-y-4">
          {shown.map((r) => <RoutingCard key={r.job.id} rec={r} onAssign={onAssign} />)}
        </div>
      )}
    </div>
  );
}

function PerformanceTab({ stats, assignments }: { stats: TeamStats; assignments: Assignment[] }) {
  const rows = stats.members.map((m) => {
    const mine = assignments.filter((a) => a.member_id === m.member_id);
    const count = (s: string) => mine.filter((a) => a.status === s).length;
    const won = count("won");
    const lost = count("lost");
    return { ...m, total: mine.filter((a) => a.status !== "declined").length, applied: count("applied"), won, lost,
      rate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null };
  }).sort((a, b) => b.won - a.won || b.total - a.total);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className="p-5">
        <h3 className="font-semibold text-slate-900">Win rate over time</h3>
        <p className="mt-0.5 text-xs text-slate-500">Each week: jobs won ÷ (won + lost), from the results your teammates report.</p>
        <div className="mt-4">
          {stats.has_outcomes ? <WinRateChart stats={stats} /> : (
            <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              No won or lost jobs yet. When teammates mark jobs as won or lost, this chart fills in.
            </p>
          )}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h3 className="font-semibold text-slate-900">Results by teammate</h3>
          <p className="mt-0.5 text-xs text-slate-500">All jobs assigned through FitWork (declined jobs not counted).</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2.5">Teammate</th>
                <th className="px-3 py-2.5 text-right">Assigned</th>
                <th className="px-3 py-2.5 text-right">Applied</th>
                <th className="px-3 py-2.5 text-right">Won</th>
                <th className="px-3 py-2.5 text-right">Lost</th>
                <th className="px-5 py-2.5 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => (
                <tr key={r.member_id} className="hover:bg-brand-50/40">
                  <td className="px-5 py-3 font-medium text-slate-900">
                    {i === 0 && r.won > 0 && <Trophy className="mr-1.5 inline h-4 w-4 text-amber-500" aria-label="Most wins" />}{r.name}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.total}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{r.applied}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{r.won}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-rose-700">{r.lost}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums">{r.rate == null ? <span className="text-slate-400">—</span> : `${r.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OwnerAgency({ initial }: { initial: AgencyData }) {
  const [agency, setAgency] = useState(initial);
  const [recs, setRecs] = useState<RoutingRecommendation[] | null>(null);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as OwnerTab | null;
  const tab: OwnerTab = tabParam && OWNER_TABS.includes(tabParam) ? tabParam : "routing";
  const setTab = (t: OwnerTab) => setParams(t === "routing" ? {} : { tab: t }, { replace: true });

  const load = useCallback(async () => {
    try {
      const [a, r, s, list] = await Promise.all([
        api<AgencyData>("/agency/me"),
        api<RoutingRecommendation[]>("/agency/routing"),
        api<TeamStats>("/agency/members/stats"),
        api<Assignment[]>("/agency/assignments"),
      ]);
      setAgency(a);
      setRecs(r);
      setStats(s);
      setAssignments(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load agency data.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(jobId: string, memberId: string) {
    setError(null);
    setNotice(null);
    try {
      const a = await api<Assignment>("/agency/assign", { method: "POST", body: { job_id: jobId, member_id: memberId } });
      setNotice(`Assigned "${a.job.title}" to ${a.member_name}. It now shows in their job queue.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign the job.");
    }
  }

  const pending = agency.members.filter((m) => m.status === "invited").length;
  const inProgress = assignments.filter((a) => a.status === "assigned" || a.status === "applied").length;
  const won = assignments.filter((a) => a.status === "won").length;
  const lost = assignments.filter((a) => a.status === "lost").length;
  const ready = stats && recs;

  return (
    <>
      <AgencyHero
        eyebrow="Your agency"
        title={agency.name}
        subtitle="FitWork matches every open job to each teammate's skills and suggests who should take it."
        actions={
          <>
            <Link to="/app/settings#agency" className={heroButton}>Rename</Link>
            <button onClick={() => setTab("team")} className={heroButton}><UserPlus className="h-4 w-4" /> Invite</button>
            <Link to="/app/chat" className={heroButton}><MessageSquare className="h-4 w-4" /> Team chat</Link>
            <button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }} disabled={refreshing} className={heroPrimary}>
              <RefreshCw className={clsx("h-4 w-4", refreshing && "animate-spin")} /> Refresh
            </button>
          </>
        }
      >
        <HeroStat icon={<Users />} label="Team" value={<CountUp value={stats?.members.length ?? 0} />}
          hint={pending ? `${pending} invite${pending === 1 ? "" : "s"} pending` : "active teammates"} />
        <HeroStat icon={<Route />} label="To assign" value={<CountUp value={recs?.length ?? 0} />} hint="jobs with a suggestion" />
        <HeroStat icon={<Briefcase />} label="In progress" value={<CountUp value={inProgress} />} hint="assigned or applied" />
        <HeroStat icon={<Trophy />} label="Win rate" value={won + lost ? <><CountUp value={Math.round((won / (won + lost)) * 100)} />%</> : "—"}
          hint={won + lost ? `${won} won · ${lost} lost` : "no results yet"} />
      </AgencyHero>

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}

      {!ready ? <SkeletonList rows={2} /> : (
        <>
          <SetupChecklist agency={agency} stats={stats} assignments={assignments} onInvite={() => setTab("team")} />
          <Tabs<OwnerTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "routing", label: "Routing", count: recs.length, icon: <Route /> },
              { id: "pipeline", label: "Pipeline", count: inProgress, icon: <KanbanSquare /> },
              { id: "team", label: "Team", count: agency.members.length, icon: <Users /> },
              { id: "performance", label: "Performance", icon: <BarChart3 /> },
            ]}
          />
          <div key={tab} className="animate-fade-up">
            {tab === "routing" && <RoutingTab recs={recs} hasMembers={stats.members.length > 0} onAssign={assign} goToTeam={() => setTab("team")} />}
            {tab === "pipeline" && (assignments.length === 0 ? (
              <EmptyState icon={<KanbanSquare className="h-6 w-6" />} title="No jobs assigned yet">
                Approve a suggestion in the Routing tab and it appears here, moving from Assigned to Applied to Won or Lost.
              </EmptyState>
            ) : <Pipeline assignments={assignments} />)}
            {tab === "team" && <TeamPanel agency={agency} stats={stats} reload={load} />}
            {tab === "performance" && (stats.members.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No teammates yet">
                Once your team starts winning and losing jobs, their results show here.
              </EmptyState>
            ) : <PerformanceTab stats={stats} assignments={assignments} />)}
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Member

function QueueCard({ a, onStatus, onDecline }: {
  a: Assignment;
  onStatus: (id: string, s: "applied" | "won" | "lost") => Promise<void>;
  onDecline: (id: string) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<"won" | "lost" | "decline" | null>(null);
  const [busy, setBusy] = useState(false);
  const open = a.status === "assigned" || a.status === "applied";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Card className={clsx("relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift", !open && "opacity-90")}>
      <span className={clsx("absolute inset-y-0 left-0 w-1",
        a.status === "won" ? "bg-emerald-500" : a.status === "lost" ? "bg-rose-400" : "bg-brand-gradient")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <PlatformBadge source={a.job.source} url={a.job.url} />
            <span className="font-medium text-slate-700">{formatBudget(a.job)}</span>
            <span>· assigned {timeAgo(a.created_at)}</span>
          </div>
          <Link to={`/app/jobs/${a.job.id}`} className="mt-1.5 block font-display text-base font-bold text-slate-900 hover:text-brand-700 sm:text-lg">{a.job.title}</Link>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.job.description_preview}</p>
        </div>
        <div className="flex items-center gap-2">
          {a.score != null && <ScorePill score={a.score} />}
          <StatusBadge status={a.status} />
        </div>
      </div>

      <div className="mt-4"><ProgressSteps status={a.status} /></div>

      {open && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {confirm ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-700">
                {confirm === "decline" ? "Decline this job? FitWork suggests the next best teammate to your owner."
                  : `Mark as ${confirm}? This is final and counts in your win rate.`}
              </span>
              <Button size="sm" variant={confirm === "won" ? "primary" : "danger"} loading={busy}
                onClick={() => run(() => (confirm === "decline" ? onDecline(a.id) : onStatus(a.id, confirm)))}>
                Yes, {confirm === "decline" ? "decline" : `mark ${confirm}`}
              </Button>
              <button onClick={() => setConfirm(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
            </span>
          ) : (
            <>
              <Link to={`/app/jobs/${a.job.id}`} className="shine inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-sm font-medium text-white shadow-glow transition hover:-translate-y-0.5">
                <Sparkles className="h-3.5 w-3.5" /> Write proposal
              </Link>
              <Link to={`/app/chat?c=job-${a.job.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-50">
                <MessageSquare className="h-3.5 w-3.5" /> Discuss
              </Link>
              {a.status === "assigned" && (
                <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => onStatus(a.id, "applied"))} icon={<Send className="h-3.5 w-3.5" />}>
                  I applied
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setConfirm("won")} icon={<Trophy className="h-3.5 w-3.5 text-emerald-600" />}>Won</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirm("lost")}>Lost</Button>
              {a.status === "assigned" && <Button size="sm" variant="ghost" onClick={() => setConfirm("decline")}>Decline</Button>}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function MemberQueue({ agency }: { agency: AgencyData }) {
  const [queue, setQueue] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "done">("active");

  const load = useCallback(async () => {
    try {
      setQueue(await api<Assignment[]>("/agency/queue"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your queue.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decline(id: string) {
    setError(null);
    try {
      const res = await api<{ next_recommendation: RoutingRecommendation | null }>(`/agency/assignments/${id}/decline`, { method: "POST" });
      setNotice(res.next_recommendation ? `Declined. FitWork suggested ${res.next_recommendation.recommended.name} to ${agency.owner_name} instead.` : "Declined.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not decline.");
    }
  }

  async function setStatus(id: string, status: "applied" | "won" | "lost") {
    setError(null);
    try {
      await api(`/agency/assignments/${id}/status`, { method: "POST", body: { status } });
      setNotice(status === "won" ? "Congratulations on the win!" : status === "applied" ? "Marked as applied. Good luck!" : "Marked as lost. The next one is yours.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    }
  }

  const items = queue ?? [];
  const count = (s: string) => items.filter((a) => a.status === s).length;
  const active = items.filter((a) => a.status === "assigned" || a.status === "applied");
  const done = items.filter((a) => a.status === "won" || a.status === "lost");
  const decided = count("won") + count("lost");
  const shown = tab === "active" ? active : done;

  return (
    <>
      <AgencyHero eyebrow={`Team member · ${agency.name}`} title="My job queue"
        subtitle={`Jobs ${agency.owner_name} assigned to you because they fit your profile best. Write a proposal, apply, then report the result.`}
        actions={<>
          <Link to="/app/chat" className={heroButton}><MessageSquare className="h-4 w-4" /> Team chat</Link>
          <Link to="/onboarding" className={heroButton}><FileText className="h-4 w-4" /> Update my skills</Link>
        </>}>
        <HeroStat icon={<Target />} label="To do" value={<CountUp value={count("assigned")} />} hint="not applied yet" />
        <HeroStat icon={<Send />} label="Applied" value={<CountUp value={count("applied")} />} hint="waiting for the client" />
        <HeroStat icon={<Trophy />} label="Won" value={<CountUp value={count("won")} />} hint={`${count("lost")} lost`} />
        <HeroStat icon={<BarChart3 />} label="Win rate" value={decided ? <><CountUp value={Math.round((count("won") / decided) * 100)} />%</> : "—"}
          hint={decided ? `from ${decided} result${decided === 1 ? "" : "s"}` : "no results yet"} />
      </AgencyHero>

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {!queue ? <SkeletonList rows={2} /> : (
        <>
          <Tabs<"active" | "done">
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "active", label: "Active", count: active.length, icon: <Inbox /> },
              { id: "done", label: "Finished", count: done.length, icon: <CheckCircle2 /> },
            ]}
          />
          {shown.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title={tab === "active" ? "No open jobs right now" : "No finished jobs yet"}>
              {tab === "active" ? (
                <>When {agency.owner_name} assigns you a job, it appears here. Keep your{" "}
                  <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">skills</Link> up to date so you get the right jobs.</>
              ) : "Jobs you mark as won or lost move here."}
            </EmptyState>
          ) : (
            <div key={tab} className="stagger-children space-y-4">
              {shown.map((a) => <QueueCard key={a.id} a={a} onStatus={setStatus} onDecline={decline} />)}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Freelancer (no agency yet)

function StartAgency() {
  const { reloadUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      await api("/agency/start", { method: "POST" });
      await reloadUser(); // role is now agency_owner, so the page switches to the owner view
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start your agency. Please try again.");
      setBusy(false);
    }
  }

  const steps = [
    { icon: <Mail />, title: "Invite your team", text: "Send each teammate a one-time invite link by email." },
    { icon: <Route />, title: "FitWork suggests who fits", text: "Every job is compared with every teammate's skills and gets a Match Score." },
    { icon: <Trophy />, title: "Assign and track", text: "Approve with one click, then follow each job from Assigned to Won." },
  ];

  return (
    <>
      <AgencyHero eyebrow="Agency Mode" title="Work as a team"
        subtitle="Run a small freelance team? Start an agency and FitWork tells you which teammate each job fits best. Your own profile and matches stay the same."
        actions={<button onClick={start} disabled={busy} className={heroPrimary}>
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Start my agency
        </button>} />
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}
      <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-3">
        {steps.map((s, i) => (
          <Card key={s.title} className="p-6 transition duration-200 hover:-translate-y-1 hover:shadow-lift">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-brand-gradient p-3 text-white shadow-glow [&>svg]:h-5 [&>svg]:w-5">{s.icon}</span>
              <span className="font-display text-3xl font-extrabold text-brand-100">0{i + 1}</span>
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-slate-900">{s.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{s.text}</p>
          </Card>
        ))}
      </div>
      <Card className="mt-6 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Ready to build your team?</h3>
          <p className="text-sm text-slate-500">Want to join someone else's team instead? Ask the agency owner for an invite link and open it while logged in.</p>
        </div>
        <Button onClick={start} loading={busy} icon={<UserPlus className="h-4 w-4" />} className="shrink-0">Start my agency</Button>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- Page

export default function Agency() {
  const { user } = useAuth();
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAgencyUser = user?.role === "agency_owner" || user?.role === "agency_member";

  useEffect(() => {
    if (!isAgencyUser) return;
    api<AgencyData>("/agency/me").then(setAgency).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your agency."));
  }, [isAgencyUser]);

  if (!isAgencyUser) return <StartAgency />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!agency) return <SkeletonList rows={2} />;
  return agency.role === "owner" ? <OwnerAgency initial={agency} /> : <MemberQueue agency={agency} />;
}

