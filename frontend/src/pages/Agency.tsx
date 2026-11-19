/**
 * Agency Mode (UC-4).
 * Owner: hero with team numbers, a setup checklist, and tabs:
 *   Routing (who should get each job, approve or pick someone else), Pipeline (Assigned -> Applied -> Won/Lost,
 *   with reassign / take back), Team (invite, members, pending invites, close agency), Performance
 *   (win-rate chart + results per person), and My jobs when the owner takes jobs too.
 * Member: their own job queue with progress steps, proposal link, status updates, decline, and "Leave agency".
 * Freelancer: explains Agency Mode and lets them start their own agency.
 * All numbers come from the server totals, so they stay right however many jobs the agency has.
 */
import clsx from "clsx";
import {
  BarChart3, Briefcase, CheckCircle2, Circle, Crown, FileText, Inbox, KanbanSquare, LogOut, Mail, MessageSquare,
  RefreshCw, Route, Send, Sparkles, Target, Trophy, UserPlus, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ClosedBadge, HeroStat, ProgressSteps, ScorePill, StatusBadge, TabPanel, Tabs } from "../components/agency/parts";
import { Pipeline, type Assignee } from "../components/agency/Pipeline";
import { RoutingCard } from "../components/agency/RoutingCard";
import { TeamPanel } from "../components/agency/TeamPanel";
import { PlatformBadge } from "../components/MatchParts";
import { Aurora } from "../components/Motion";
import { Orb3D } from "../components/Orb3D";
import { Alert, Button, Card, CountUp, EmptyState, SkeletonList } from "../components/ui";
import { WinRateChart } from "../components/WinRateChart";
import { api, ApiError, peek } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatBudget, timeAgo } from "../lib/format";
import type { Agency as AgencyData, Assignment, RoutingRecommendation, TeamStats } from "../lib/types";

const ROUTING_PAGE = 20;
// The viewer's minutes ahead of UTC, so "assigned today" and the weekly chart follow their own clock
const TZ_MINUTES = -new Date().getTimezoneOffset();

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

const winRate = (won: number, lost: number) => (won + lost ? Math.round((won / (won + lost)) * 100) : null);

// ---------------------------------------------------------------- Owner

type OwnerTab = "routing" | "pipeline" | "team" | "performance" | "mine";
const OWNER_TABS: OwnerTab[] = ["routing", "pipeline", "team", "performance", "mine"];

/** The four things an owner needs before Agency Mode is useful. Hidden once all are done. */
function SetupChecklist({ agency, stats, onInvite }: { agency: AgencyData; stats: TeamStats; onInvite: () => void }) {
  const teammates = stats.members.filter((m) => !m.is_owner);
  const given = stats.totals.assigned + stats.totals.applied + stats.totals.won + stats.totals.lost;
  const steps = [
    { done: agency.members.length > 0, title: "Invite a teammate", text: "Send an invite link by email." },
    { done: teammates.length > 0, title: "Teammate joins", text: "They open the link and join your agency." },
    { done: teammates.length > 0 && teammates.every((m) => m.has_profile), title: "Profiles completed", text: "Each teammate adds their skills, so FitWork can match them." },
    { done: given > 0, title: "Assign your first job", text: "Approve a suggestion in the Routing tab." },
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

function RoutingTab({ recs, canRoute, onAssign, goToTeam }: {
  recs: RoutingRecommendation[]; canRoute: boolean; onAssign: (jobId: string, memberId: string) => Promise<void>; goToTeam: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "strong" | "low">("all");
  const [visible, setVisible] = useState(ROUTING_PAGE);
  const matching = recs.filter((r) => filter === "all" || (filter === "strong" ? r.recommended.score >= 75 : r.low_team_fit));
  const shown = matching.slice(0, visible);
  const counts = { all: recs.length, strong: recs.filter((r) => r.recommended.score >= 75).length, low: recs.filter((r) => r.low_team_fit).length };

  if (!canRoute) {
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
        <div className="flex flex-wrap gap-1.5">
          {([["all", "All"], ["strong", "Strong fit 75+"], ["low", "Low team fit"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setFilter(id); setVisible(ROUTING_PAGE); }} aria-pressed={filter === id}
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
      {matching.length > shown.length && (
        <div className="mt-5 flex flex-col items-center gap-1">
          <Button variant="secondary" onClick={() => setVisible((v) => v + ROUTING_PAGE)}>
            Show {Math.min(ROUTING_PAGE, matching.length - shown.length)} more
          </Button>
          <p className="text-xs text-slate-500">Showing {shown.length} of {matching.length}</p>
        </div>
      )}
    </div>
  );
}

function PerformanceTab({ stats }: { stats: TeamStats }) {
  const rows = [...stats.results].sort((a, b) => b.won - a.won || b.assigned - a.assigned);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <Card className="p-5">
        <h3 className="font-semibold text-slate-900">Win rate over time</h3>
        <p className="mt-0.5 text-xs text-slate-500">Each week: jobs won ÷ (won + lost), for people in the team now.</p>
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
          <p className="mt-0.5 text-xs text-slate-500">Every job given out through FitWork. People who left keep their history.</p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-2.5">Teammate</th>
                <th scope="col" className="px-3 py-2.5 text-right">Given</th>
                <th scope="col" className="px-3 py-2.5 text-right">Applied</th>
                <th scope="col" className="px-3 py-2.5 text-right">Won</th>
                <th scope="col" className="px-3 py-2.5 text-right">Lost</th>
                <th scope="col" className="px-5 py-2.5 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, i) => {
                const rate = winRate(r.won, r.lost);
                return (
                  <tr key={r.member_id} className={clsx("hover:bg-brand-50/40", !r.current && "text-slate-500")}>
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {i === 0 && r.won > 0 && <Trophy className="mr-1.5 inline h-4 w-4 text-amber-500" aria-label="Most wins" />}
                      {r.name}{!r.current && <span className="ml-1.5 text-xs font-normal text-slate-400">(left)</span>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.assigned}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{r.applied}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">{r.won}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-rose-700">{r.lost}</td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{rate == null ? <span className="text-slate-400">—</span> : `${rate}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OwnerAgency({ initial }: { initial: AgencyData }) {
  const { user, reloadUser } = useAuth();
  const [agency, setAgency] = useState(initial);
  // Remembered answers show at once; load() below refreshes them
  const [recs, setRecs] = useState<RoutingRecommendation[] | null>(() => peek<RoutingRecommendation[]>("/agency/routing?limit=200") ?? null);
  const [stats, setStats] = useState<TeamStats | null>(() => peek<TeamStats>(`/agency/members/stats?tz=${TZ_MINUTES}`) ?? null);
  const [assignments, setAssignments] = useState<Assignment[]>(() => peek<Assignment[]>("/agency/assignments") ?? []);
  const [myQueue, setMyQueue] = useState<Assignment[]>(() => peek<Assignment[]>("/agency/queue") ?? []);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab") as OwnerTab | null;
  const tab: OwnerTab = tabParam && OWNER_TABS.includes(tabParam) ? tabParam : "routing";
  const setTab = (t: OwnerTab) => {
    setNotice(null);
    setParams(t === "routing" ? {} : { tab: t }, { replace: true });
  };

  const load = useCallback(async () => {
    try {
      const [a, r, s, list, mine] = await Promise.all([
        api<AgencyData>("/agency/me"),
        api<RoutingRecommendation[]>("/agency/routing?limit=200"),
        api<TeamStats>(`/agency/members/stats?tz=${TZ_MINUTES}`),
        api<Assignment[]>("/agency/assignments"),
        api<Assignment[]>("/agency/queue"),
      ]);
      setAgency(a);
      setRecs(r);
      setStats(s);
      setAssignments(list);
      setMyQueue(mine);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) await reloadUser(); // role changed elsewhere
      setError(err instanceof ApiError ? err.message : "Could not load agency data.");
    }
  }, [reloadUser]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(jobId: string, memberId: string) {
    setError(null);
    setNotice(null);
    try {
      const a = await api<Assignment>("/agency/assign", { method: "POST", body: { job_id: jobId, member_id: memberId } });
      setNotice(a.member_id === user?.id
        ? `You took "${a.job.title}". It is in your My jobs tab.`
        : `Assigned "${a.job.title}" to ${a.member_name}. It now shows in their job queue.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign the job.");
    }
  }

  async function setMyStatus(id: string, status: "applied" | "won" | "lost") {
    setError(null);
    try {
      await api(`/agency/assignments/${id}/status`, { method: "POST", body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    }
  }

  async function declineMine(id: string) {
    setError(null);
    try {
      await api(`/agency/assignments/${id}/decline`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not decline.");
    }
  }

  const active = agency.members.filter((m) => m.status === "active");
  const pending = agency.members.length - active.length;
  const totals = stats?.totals;
  const inProgress = totals ? totals.assigned + totals.applied : 0;
  const rate = totals ? winRate(totals.won, totals.lost) : null;
  const ownerCanTake = !!stats?.members.some((m) => m.is_owner);
  const assignees: Assignee[] = [
    ...(ownerCanTake && user ? [{ id: user.id, name: `${user.full_name} (you)` }] : []),
    ...active.filter((m) => m.user_id).map((m) => ({ id: m.user_id as string, name: m.name ?? m.email })),
  ];
  const myOpen = myQueue.filter((a) => a.status === "assigned" || a.status === "applied").length;

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
        <HeroStat icon={<Users />} label="Team" value={<CountUp value={active.length} />}
          hint={pending ? `${pending} invite${pending === 1 ? "" : "s"} pending` : "active teammates"} />
        <HeroStat icon={<Route />} label="To assign" value={<CountUp value={recs?.length ?? 0} />} hint="jobs with a suggestion" />
        <HeroStat icon={<Briefcase />} label="In progress" value={<CountUp value={inProgress} />} hint="assigned or applied" />
        <HeroStat icon={<Trophy />} label="Win rate" value={rate == null ? "—" : <><CountUp value={rate} />%</>}
          hint={totals && totals.won + totals.lost ? `${totals.won} won · ${totals.lost} lost` : "no results yet"} />
      </AgencyHero>

      {error && <Alert tone="error" className="mb-6">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-6">{notice}</Alert>}

      {!stats || !recs ? <SkeletonList rows={2} /> : (
        <>
          <SetupChecklist agency={agency} stats={stats} onInvite={() => setTab("team")} />
          <Tabs<OwnerTab>
            idPrefix="agency"
            label="Agency sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "routing", label: "Routing", count: recs.length, icon: <Route /> },
              { id: "pipeline", label: "Pipeline", count: inProgress, icon: <KanbanSquare /> },
              { id: "team", label: "Team", count: active.length, icon: <Users /> },
              { id: "performance", label: "Performance", icon: <BarChart3 /> },
              ...(ownerCanTake || myQueue.length ? [{ id: "mine" as const, label: "My jobs", count: myOpen, icon: <Inbox /> }] : []),
            ]}
          />
          <TabPanel idPrefix="agency" value={tab}>
            {tab === "routing" && <RoutingTab recs={recs} canRoute={stats.members.length > 0} onAssign={assign} goToTeam={() => setTab("team")} />}
            {tab === "pipeline" && (stats.totals.assigned + stats.totals.applied + stats.totals.won + stats.totals.lost === 0 ? (
              <EmptyState icon={<KanbanSquare className="h-6 w-6" />} title="No jobs assigned yet">
                Approve a suggestion in the Routing tab and it appears here, moving from Assigned to Applied to Won or Lost.
              </EmptyState>
            ) : (
              <Pipeline assignments={assignments} totals={stats.totals} assignees={assignees}
                onChanged={async (msg) => { setNotice(msg); await load(); }} onError={setError} />
            ))}
            {tab === "team" && <TeamPanel agency={agency} stats={stats} reload={load} />}
            {tab === "performance" && (stats.results.length === 0 ? (
              <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No teammates yet">
                Once your team starts winning and losing jobs, their results show here.
              </EmptyState>
            ) : <PerformanceTab stats={stats} />)}
            {tab === "mine" && (myQueue.length === 0 ? (
              <EmptyState icon={<Inbox className="h-6 w-6" />} title="No jobs for you yet">
                Your profile is filled in, so FitWork can suggest you for jobs too. Pick "Take this job myself" in Routing.
              </EmptyState>
            ) : (
              <div className="stagger-children space-y-4">
                {myQueue.map((a) => <QueueCard key={a.id} a={a} onStatus={setMyStatus} onDecline={declineMine} />)}
              </div>
            ))}
          </TabPanel>
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
  const closed = a.job.is_active === false && open;

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
    <Card className={clsx("relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift", (!open || closed) && "opacity-90")}>
      <span className={clsx("absolute inset-y-0 left-0 w-1",
        a.status === "won" ? "bg-emerald-500" : a.status === "lost" ? "bg-rose-400" : closed ? "bg-slate-400" : "bg-brand-gradient")} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <PlatformBadge source={a.job.source} url={a.job.url} />
            <span className="font-medium text-slate-700">{formatBudget(a.job)}</span>
            <span>· assigned {timeAgo(a.created_at)}</span>
            {closed && <ClosedBadge />}
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
      {closed && a.status === "assigned" && (
        <p className="mt-3 text-sm text-slate-600">This job has closed on its platform, so it can't be applied to any more. Remove it to clear your queue.</p>
      )}

      {open && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {confirm ? (
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-700">
                {confirm === "decline"
                  ? (closed ? "Remove this closed job from your queue?" : "Decline this job? FitWork suggests the next best teammate to your owner.")
                  : `Mark as ${confirm}? This is final and counts in your win rate.`}
              </span>
              <Button size="sm" variant={confirm === "won" ? "primary" : "danger"} loading={busy}
                onClick={() => run(() => (confirm === "decline" ? onDecline(a.id) : onStatus(a.id, confirm)))}>
                Yes, {confirm === "decline" ? (closed ? "remove" : "decline") : `mark ${confirm}`}
              </Button>
              <button onClick={() => setConfirm(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Cancel"><X className="h-4 w-4" /></button>
            </span>
          ) : (
            <>
              {!closed && (
                <Link to={`/app/jobs/${a.job.id}`} className="shine inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-gradient px-3 text-sm font-medium text-white shadow-glow transition hover:-translate-y-0.5">
                  <Sparkles className="h-3.5 w-3.5" /> Write proposal
                </Link>
              )}
              <Link to={`/app/chat?c=job-${a.job.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-soft transition hover:-translate-y-0.5 hover:bg-brand-50">
                <MessageSquare className="h-3.5 w-3.5" /> Discuss
              </Link>
              {a.status === "assigned" && !closed && (
                <Button size="sm" variant="secondary" loading={busy} onClick={() => run(() => onStatus(a.id, "applied"))} icon={<Send className="h-3.5 w-3.5" />}>
                  I applied
                </Button>
              )}
              {/* A result comes after applying, so Won / Lost appear only once the job is "Applied" */}
              {a.status === "applied" && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setConfirm("won")} icon={<Trophy className="h-3.5 w-3.5 text-emerald-600" />}>Won</Button>
                  <Button size="sm" variant="secondary" onClick={() => setConfirm("lost")}>Lost</Button>
                </>
              )}
              {a.status === "assigned" && (
                <Button size="sm" variant="ghost" onClick={() => setConfirm("decline")}>{closed ? "Remove" : "Decline"}</Button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function LeaveAgency({ agencyName }: { agencyName: string }) {
  const { reloadUser } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);
    try {
      await api("/agency/leave", { method: "POST" });
      await reloadUser(); // role is now freelancer
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not leave the agency.");
      setBusy(false);
    }
  }

  return (
    <Card className="mt-8 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-slate-900">Leave {agencyName}</h3>
        <p className="text-sm text-slate-500">You become a solo freelancer again. Your open jobs go back to the owner; your profile and matches stay.</p>
        {error && <p className="mt-1 text-sm text-rose-600">{error}</p>}
      </div>
      {confirm ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="danger" loading={busy} onClick={leave}>Yes, leave</Button>
          <Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
        </div>
      ) : (
        <Button variant="danger" className="shrink-0" icon={<LogOut className="h-4 w-4" />} onClick={() => setConfirm(true)}>Leave agency</Button>
      )}
    </Card>
  );
}

function MemberQueue({ agency }: { agency: AgencyData }) {
  const { reloadUser } = useAuth();
  const [queue, setQueue] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "done">("active");

  const load = useCallback(async () => {
    try {
      setQueue(await api<Assignment[]>("/agency/queue"));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) await reloadUser(); // removed from the agency
      setError(err instanceof ApiError ? err.message : "Could not load your queue.");
    }
  }, [reloadUser]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decline(id: string) {
    setError(null);
    try {
      const res = await api<{ next_recommendation: RoutingRecommendation | null }>(`/agency/assignments/${id}/decline`, { method: "POST" });
      setNotice(res.next_recommendation ? `Declined. FitWork suggested ${res.next_recommendation.recommended.name} to ${agency.owner_name} instead.` : "Removed from your queue.");
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
  const rate = winRate(count("won"), count("lost"));
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
        <HeroStat icon={<BarChart3 />} label="Win rate" value={rate == null ? "—" : <><CountUp value={rate} />%</>}
          hint={rate == null ? "no results yet" : `from ${count("won") + count("lost")} result${count("won") + count("lost") === 1 ? "" : "s"}`} />
      </AgencyHero>

      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}

      {!queue ? <SkeletonList rows={2} /> : (
        <>
          <Tabs<"active" | "done">
            idPrefix="queue"
            label="My jobs"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "active", label: "Active", count: active.length, icon: <Inbox /> },
              { id: "done", label: "Finished", count: done.length, icon: <CheckCircle2 /> },
            ]}
          />
          <TabPanel idPrefix="queue" value={tab}>
            {shown.length === 0 ? (
              <EmptyState icon={<Inbox className="h-6 w-6" />} title={tab === "active" ? "No open jobs right now" : "No finished jobs yet"}>
                {tab === "active" ? (
                  <>When {agency.owner_name} assigns you a job, it appears here. Keep your{" "}
                    <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">skills</Link> up to date so you get the right jobs.</>
                ) : "Jobs you mark as won or lost move here."}
              </EmptyState>
            ) : (
              <div className="stagger-children space-y-4">
                {shown.map((a) => <QueueCard key={a.id} a={a} onStatus={setStatus} onDecline={decline} />)}
              </div>
            )}
          </TabPanel>
          <LeaveAgency agencyName={agency.name} />
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
  const { user, reloadUser } = useAuth();
  const [agency, setAgency] = useState<AgencyData | null>(() => peek<AgencyData>("/agency/me") ?? null);
  const [error, setError] = useState<string | null>(null);
  const isAgencyUser = user?.role === "agency_owner" || user?.role === "agency_member";

  useEffect(() => {
    if (!isAgencyUser) return;
    setAgency(null);
    setError(null);
    api<AgencyData>("/agency/me").then(setAgency).catch(async (err) => {
      // The role may have changed elsewhere (removed from the team, agency closed): refresh it, and the
      // page shows the right view instead of a raw "not allowed" error.
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) await reloadUser();
      setError(err instanceof ApiError ? err.message : "Could not load your agency.");
    });
  }, [isAgencyUser, user?.role, reloadUser]);

  if (!isAgencyUser) return <StartAgency />;
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!agency) return <SkeletonList rows={2} />;
  return agency.role === "owner" ? <OwnerAgency initial={agency} /> : <MemberQueue agency={agency} />;
}
