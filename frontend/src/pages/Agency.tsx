/**
 * Agency Mode (UC-4).
 * Owner: team table, routing panel (approve / override), assigned jobs, win-rate chart.
 * Member: "My Job Queue" with decline, status updates and a link to generate a proposal.
 */
import clsx from "clsx";
import { AlertTriangle, ArrowRight, Check, Inbox, RefreshCw, Sparkles, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { PlatformBadge } from "../components/MatchParts";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SkeletonList } from "../components/ui";
import { WinRateChart } from "../components/WinRateChart";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatBudget, scoreTone, timeAgo } from "../lib/format";
import type { Agency as AgencyData, Assignment, AssignmentStatus, RoutingRecommendation, TeamStats } from "../lib/types";

function ScorePill({ score }: { score: number }) {
  const tone = scoreTone(score);
  return <span className={clsx("rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums", tone.bg, tone.text)}>{score}</span>;
}

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  recommended: "bg-slate-100 text-slate-600",
  assigned: "bg-brand-50 text-brand-700",
  declined: "bg-slate-100 text-slate-500",
  applied: "bg-sky-50 text-sky-700",
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-red-50 text-red-700",
};

function StatusBadge({ status }: { status: AssignmentStatus }) {
  return <Badge className={clsx("capitalize", STATUS_STYLE[status])}>{status}</Badge>;
}

// ---------------------------------------------------------------- Owner

function RoutingCard({ rec, onAssign }: { rec: RoutingRecommendation; onAssign: (jobId: string, memberId: string) => Promise<void> }) {
  const [override, setOverride] = useState(false);
  const [choice, setChoice] = useState(rec.alternatives[0]?.member_id ?? "");
  const [busy, setBusy] = useState(false);

  async function assign(memberId: string) {
    setBusy(true);
    try {
      await onAssign(rec.job.id, memberId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <PlatformBadge source={rec.job.source} url={rec.job.url} />
        <span>{formatBudget(rec.job)}</span>
        <span>· {timeAgo(rec.job.posted_at)}</span>
        {rec.rerouted_after_decline && <Badge className="bg-amber-50 text-amber-700">Re-routed after decline</Badge>}
        {rec.low_team_fit && (
          <Badge className="bg-red-50 text-red-700">
            <AlertTriangle className="mr-1 h-3 w-3" /> Low Team Fit
          </Badge>
        )}
      </div>
      <Link to={`/app/jobs/${rec.job.id}`} className="mt-1.5 block font-medium text-slate-900 hover:text-brand-700">
        {rec.job.title}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">This job</span>
        <ArrowRight className="h-4 w-4 text-slate-400" />
        <span className="font-semibold text-slate-900">{rec.recommended.name}</span>
        <ScorePill score={rec.recommended.score} />
        {rec.alternatives.length > 0 && (
          <span className="text-xs text-slate-500">
            next: {rec.alternatives.slice(0, 2).map((a) => `${a.name.split(" ")[0]} ${a.score}`).join(", ")}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">{rec.recommended.reason}.</p>
      {rec.low_team_fit && rec.missing_skills.length > 0 && (
        <p className="mt-1 text-xs text-red-700">Nobody in the team has: {rec.missing_skills.join(", ")}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!override ? (
          <>
            <Button size="sm" onClick={() => assign(rec.recommended.member_id)} loading={busy} icon={<Check className="h-3.5 w-3.5" />}>
              Approve
            </Button>
            {rec.alternatives.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setOverride(true)}>Override</Button>
            )}
          </>
        ) : (
          <>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" aria-label="Assign to">
              {rec.alternatives.map((a) => (
                <option key={a.member_id} value={a.member_id}>{a.name} ({a.score})</option>
              ))}
            </select>
            <Button size="sm" onClick={() => assign(choice)} loading={busy}>Assign</Button>
            <Button size="sm" variant="ghost" onClick={() => setOverride(false)}>Cancel</Button>
          </>
        )}
      </div>
    </div>
  );
}

function OwnerAgency({ agency }: { agency: AgencyData }) {
  const [recs, setRecs] = useState<RoutingRecommendation[] | null>(null);
  const [stats, setStats] = useState<TeamStats | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, s, a] = await Promise.all([
        api<RoutingRecommendation[]>("/agency/routing"),
        api<TeamStats>("/agency/members/stats"),
        api<Assignment[]>("/agency/assignments"),
      ]);
      setRecs(r);
      setStats(s);
      setAssignments(a);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load agency data.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(jobId: string, memberId: string) {
    setError(null);
    try {
      await api("/agency/assign", { method: "POST", body: { job_id: jobId, member_id: memberId } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign the job.");
    }
  }

  const activeMembers = agency.members.filter((m) => m.status === "active").length;

  return (
    <>
      <PageHeader
        icon={<Users />}
        title={agency.name}
        subtitle={`${activeMembers} active member${activeMembers === 1 ? "" : "s"} · jobs are routed to the teammate with the highest Match Score`}
        actions={
          <>
            <Link to="/app/settings#agency" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
              <UserPlus className="h-4 w-4" /> Invite member
            </Link>
            <Button onClick={async () => { setRefreshing(true); await load(); setRefreshing(false); }} loading={refreshing} icon={<RefreshCw className="h-4 w-4" />}>
              Refresh
            </Button>
          </>
        }
      />
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {!stats || !recs ? (
        <SkeletonList rows={2} />
      ) : stats.members.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Invite your first team member">
          Members join with an invite link and complete their own profile. Then FitWork routes each job to the best person.{" "}
          <Link to="/app/settings#agency" className="font-medium text-brand-600 hover:underline">Invite a member →</Link>
        </EmptyState>
      ) : (
        <div className="stagger-children space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-semibold text-slate-900">Team</h2>
            </div>
            {/* Phones: one card per member (the table is too wide for a phone screen) */}
            <ul className="divide-y divide-slate-100 sm:hidden">
              {stats.members.map((m) => (
                <li key={m.member_id} className="space-y-2 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{m.name}</p>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                  </div>
                  {m.has_profile ? (
                    <div className="flex flex-wrap gap-1">{m.top_skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                  ) : (
                    <span className="text-xs text-amber-700">Profile not completed yet</span>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "Active", value: m.active_assignments },
                      { label: "Win rate 30d", value: m.win_rate_30d == null ? "—" : `${Math.round(m.win_rate_30d * 100)}%` },
                      { label: "Routed today", value: m.routed_today },
                    ].map((x) => (
                      <div key={x.label} className="rounded-xl bg-brand-50/60 px-2 py-1.5">
                        <p className="font-display text-base font-bold text-slate-900">{x.value}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{x.label}</p>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Name</th>
                    <th className="px-5 py-2.5">Top skills</th>
                    <th className="px-5 py-2.5 text-right">Active</th>
                    <th className="px-5 py-2.5 text-right">Win rate (30d)</th>
                    <th className="px-5 py-2.5 text-right">Routed today</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.members.map((m) => (
                    <tr key={m.member_id} className="transition-colors hover:bg-brand-50/40">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900">{m.name}</p>
                        <p className="text-xs text-slate-500">{m.email}</p>
                      </td>
                      <td className="px-5 py-3">
                        {m.has_profile ? (
                          <div className="flex flex-wrap gap-1">{m.top_skills.map((s) => <Badge key={s}>{s}</Badge>)}</div>
                        ) : (
                          <span className="text-xs text-amber-700">Profile not completed yet</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{m.active_assignments}</td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {m.win_rate_30d == null ? <span className="text-slate-400">—</span> : `${Math.round(m.win_rate_30d * 100)}% (${m.decided_30d})`}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">{m.routed_today}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] [&>*]:min-w-0">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">Routing recommendations</h2>
                <span className="text-xs text-slate-500">{recs.length} jobs</span>
              </div>
              <div className="stagger-children mt-4 space-y-3">
                {recs.length === 0 ? (
                  <p className="text-sm text-slate-500">No unassigned jobs fit your team right now. Members need completed profiles to be routed jobs.</p>
                ) : (
                  recs.map((r) => <RoutingCard key={r.job.id} rec={r} onAssign={assign} />)
                )}
              </div>
            </Card>

            <div className="space-y-6">
              <Card className="p-5">
                <h2 className="font-semibold text-slate-900">Win rate over time</h2>
                <p className="mt-0.5 text-xs text-slate-500">Weekly won ÷ (won + lost), from members' real outcomes.</p>
                <div className="mt-4">
                  {stats.has_outcomes ? (
                    <WinRateChart stats={stats} />
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                      No won or lost jobs yet. When members mark jobs as won or lost, this chart fills in.
                    </p>
                  )}
                </div>
              </Card>

              <Card className="p-5">
                <h2 className="font-semibold text-slate-900">Assigned jobs</h2>
                <ul className="mt-3 divide-y divide-slate-100">
                  {assignments.length === 0 && <li className="py-2 text-sm text-slate-500">Nothing assigned yet.</li>}
                  {assignments.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link to={`/app/jobs/${a.job.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700">{a.job.title}</Link>
                        <p className="text-xs text-slate-500">{a.member_name} · {timeAgo(a.updated_at)}</p>
                      </div>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Member

function MemberQueue({ agency }: { agency: AgencyData }) {
  const [queue, setQueue] = useState<Assignment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

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
      setNotice(res.next_recommendation ? `Declined. FitWork suggested ${res.next_recommendation.recommended.name} to your agency owner instead.` : "Declined.");
      setConfirming(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not decline.");
    }
  }

  async function setStatus(id: string, status: "applied" | "won" | "lost") {
    setError(null);
    try {
      await api(`/agency/assignments/${id}/status`, { method: "POST", body: { status } });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    }
  }

  return (
    <>
      <PageHeader icon={<Inbox />} title="My Job Queue" subtitle={`Jobs ${agency.owner_name} assigned to you at ${agency.name}`} />
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-4">{notice}</Alert>}
      {!queue ? (
        <SkeletonList rows={2} />
      ) : queue.length === 0 ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="Your queue is empty">
          When your agency owner assigns you a job, it appears here. Keep your{" "}
          <Link to="/onboarding" className="font-medium text-brand-600 hover:underline">profile</Link> up to date so you get the right jobs.
        </EmptyState>
      ) : (
        <div className="stagger-children space-y-4">
          {queue.map((a) => (
            <Card key={a.id} className="p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <PlatformBadge source={a.job.source} url={a.job.url} />
                    <span>{formatBudget(a.job)}</span>
                    <span>· assigned {timeAgo(a.created_at)}</span>
                  </div>
                  <Link to={`/app/jobs/${a.job.id}`} className="mt-1.5 block font-semibold text-slate-900 hover:text-brand-700">{a.job.title}</Link>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">{a.job.description_preview}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.score != null && <ScorePill score={a.score} />}
                  <StatusBadge status={a.status} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link to={`/app/jobs/${a.job.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">
                  <Sparkles className="h-3.5 w-3.5" /> Generate proposal
                </Link>
                {a.status === "assigned" && <Button size="sm" variant="secondary" onClick={() => setStatus(a.id, "applied")}>Mark applied</Button>}
                {(a.status === "assigned" || a.status === "applied") && (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setStatus(a.id, "won")}>Won</Button>
                    <Button size="sm" variant="secondary" onClick={() => setStatus(a.id, "lost")}>Lost</Button>
                  </>
                )}
                {a.status === "assigned" && (
                  confirming === a.id ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="text-slate-600">Decline this job?</span>
                      <Button size="sm" variant="danger" onClick={() => decline(a.id)}>Yes, decline</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}><X className="h-3.5 w-3.5" /></Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(a.id)}>Decline</Button>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Page

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

  return (
    <>
      <PageHeader icon={<Users />} title="Agency Mode" />
      <EmptyState icon={<Users className="h-6 w-6" />} title="Work as a team">
        <span className="block">
          Start your own agency, invite your teammates by email, and FitWork suggests which teammate each job fits best.
          Your own profile and matches stay the same.
        </span>
        <span className="mt-4 block">
          <Button onClick={start} loading={busy}>
            <UserPlus className="h-4 w-4" /> Start my agency
          </Button>
        </span>
        {error && <span className="mt-3 block text-sm text-red-600">{error}</span>}
        <span className="mt-4 block text-xs text-slate-500">
          Want to join someone else's team instead? Ask the agency owner for an invite link and open it while logged in.
        </span>
      </EmptyState>
    </>
  );
}

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
  return agency.role === "owner" ? <OwnerAgency agency={agency} /> : <MemberQueue agency={agency} />;
}
