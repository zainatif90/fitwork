/**
 * Team tab for the owner: invite by email, see every teammate (skills, workload, win rate),
 * resend pending invites and remove members. Everything happens on this page (no trip to Settings).
 */
import clsx from "clsx";
import { AlertTriangle, Briefcase, Check, Copy, Crown, Mail, RefreshCw, Trash2, Trophy, UserPlus, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { timeAgo } from "../../lib/format";
import type { Agency, AgencyMemberRow, TeamMemberStats, TeamStats } from "../../lib/types";
import { Alert, Badge, Button, Card, Input } from "../ui";
import { Avatar } from "./parts";

type InviteResult = { member: AgencyMemberRow; invite_token: string; email_sent: boolean };

export function InviteForm({ onInvited, autoFocus }: { onInvited: () => Promise<void>; autoFocus?: boolean }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<{ email: string; link: string; emailed: boolean } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<InviteResult>("/agency/invite", { method: "POST", body: { email } });
      setLast({ email: res.member.email, link: `${window.location.origin}/invite/${res.invite_token}`, emailed: res.email_sent });
      setEmail("");
      await onInvited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="invite-email" className="sr-only">Teammate's email</label>
        <Input id="invite-email" type="email" required autoFocus={autoFocus} value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="teammate@example.com" className="sm:flex-1" />
        <Button type="submit" loading={busy} disabled={!email} icon={<Mail className="h-4 w-4" />}>Send invite</Button>
      </form>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {last && <InviteLink {...last} />}
    </div>
  );
}

function InviteLink({ email, link, emailed }: { email: string; link: string; emailed: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
    }
  }

  return (
    <Alert tone="success" className="mt-3">
      <p>
        {emailed ? <>Invite emailed to <strong>{email}</strong>. You can also send them this link:</>
          : <>Invite ready for <strong>{email}</strong>. Send them this link:</>}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="block min-w-0 flex-1 truncate rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700 select-all">{link}</code>
        <Button size="sm" variant="secondary" onClick={copy} icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {copyFailed && <p className="mt-1 text-xs">Could not copy automatically. Select the link and copy it.</p>}
    </Alert>
  );
}

function RemoveButton({ row, onRemoved }: { row: AgencyMemberRow; onRemoved: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = row.name ?? row.email;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/agency/members/${row.id}`, { method: "DELETE" });
      await onRemoved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not remove.");
      setBusy(false);
    }
  }

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${who}`}>
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-xs text-slate-600">{row.status === "active" ? `Remove ${who}? Their open jobs go back to Routing.` : "Cancel this invite?"}</span>
      <Button size="sm" variant="danger" onClick={remove} loading={busy}>Remove</Button>
      <button onClick={() => setConfirm(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Keep"><X className="h-3.5 w-3.5" /></button>
      {error && <span className="w-full text-right text-xs text-rose-600">{error}</span>}
    </div>
  );
}

function ResendButton({ email, onDone }: { email: string; onDone: (r: { email: string; link: string; emailed: boolean }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<InviteResult>("/agency/invite", { method: "POST", body: { email } });
      onDone({ email, link: `${window.location.origin}/invite/${res.invite_token}`, emailed: res.email_sent });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resend.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={resend} loading={busy} icon={<RefreshCw className="h-3.5 w-3.5" />}>Resend</Button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </>
  );
}

/** Danger zone: the owner closes the agency after typing its name. Everyone becomes a solo freelancer. */
function CloseAgency({ name }: { name: string }) {
  const { reloadUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/agency/close", { method: "POST", body: { confirm_name: typed } });
      await reloadUser(); // role is now freelancer: the Agency page switches to "Start my agency"
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not close the agency.");
      setBusy(false);
    }
  }

  return (
    <Card className="border-rose-200 p-5 sm:p-6">
      <h3 className="flex items-center gap-2 font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> Close agency</h3>
      <p className="mt-1 text-sm text-slate-600">
        Everyone goes back to being a solo freelancer. Assigned jobs, results and team chat are deleted. Profiles and personal matches stay.
      </p>
      {!open ? (
        <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>Close this agency…</Button>
      ) : (
        <form onSubmit={close} className="mt-4 space-y-2">
          <label htmlFor="close-name" className="block text-sm text-slate-700">Type <strong>{name}</strong> to confirm</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="close-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="sm:flex-1" />
            <Button type="submit" variant="danger" loading={busy} disabled={typed.trim() !== name.trim()}>Close agency for good</Button>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</Button>
          </div>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}
    </Card>
  );
}

function OwnerCard({ s }: { s: TeamMemberStats }) {
  return (
    <Card className="p-5 ring-2 ring-brand-200">
      <div className="flex items-start gap-3">
        <Avatar id={s.member_id} name={s.name} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900">{s.name} <span className="text-slate-400">(you)</span></p>
          <p className="flex items-center gap-1 text-xs font-medium text-brand-700"><Crown className="h-3.5 w-3.5" /> Owner · also takes jobs</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">{s.top_skills.map((k) => <Badge key={k}>{k}</Badge>)}</div>
      <p className="mt-3 text-xs text-slate-500">
        {s.active_assignments} open job{s.active_assignments === 1 ? "" : "s"} · You get suggestions too because your profile is filled in.
      </p>
    </Card>
  );
}

export function TeamPanel({ agency, stats, reload }: { agency: Agency; stats: TeamStats; reload: () => Promise<void> }) {
  const [resent, setResent] = useState<{ email: string; link: string; emailed: boolean } | null>(null);
  const active = agency.members.filter((m) => m.status === "active");
  const pending = agency.members.filter((m) => m.status === "invited");
  const busiest = Math.max(1, ...stats.members.map((m) => m.active_assignments));
  const ownerStats = stats.members.find((m) => m.is_owner);

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900"><UserPlus className="h-4 w-4 text-brand-600" /> Invite a teammate</h3>
        <p className="mb-4 mt-1 text-sm text-slate-500">They get a one-time link by email, sign up or log in with that email, and join your team.</p>
        <InviteForm onInvited={reload} />
      </Card>

      <div>
        <h3 className="mb-3 font-semibold text-slate-900">Members <span className="text-slate-400">({active.length})</span></h3>
        {ownerStats && <div className="mb-4 max-w-md"><OwnerCard s={ownerStats} /></div>}
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
            Nobody has joined yet. When someone opens your invite link, they appear here.
          </p>
        ) : (
          <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
            {active.map((row) => {
              const s = stats.members.find((m) => m.member_id === row.user_id);
              const name = row.name ?? row.email;
              return (
                <Card key={row.id} className="p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start gap-3">
                    <Avatar id={row.user_id ?? row.id} name={name} size="lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{name}</p>
                      <p className="truncate text-xs text-slate-500">{row.email}</p>
                      {row.joined_at && <p className="text-[11px] text-slate-400">Joined {timeAgo(row.joined_at)}</p>}
                    </div>
                    <RemoveButton row={row} onRemoved={reload} />
                  </div>

                  <div className="mt-3 min-h-[1.75rem]">
                    {s?.has_profile ? (
                      <div className="flex flex-wrap gap-1">{s.top_skills.map((k) => <Badge key={k}>{k}</Badge>)}</div>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700">Profile not completed: no jobs routed yet</Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-slate-500"><Briefcase className="h-3.5 w-3.5" /> Workload</span>
                        <span className="font-semibold tabular-nums text-slate-700">{s?.active_assignments ?? 0} open job{s?.active_assignments === 1 ? "" : "s"}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-gradient transition-all duration-700"
                          style={{ width: `${((s?.active_assignments ?? 0) / busiest) * 100}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-xl bg-emerald-50/70 px-2 py-2">
                        <p className="flex items-center justify-center gap-1 font-display text-base font-bold text-slate-900">
                          <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                          {s?.win_rate_30d == null ? "—" : `${Math.round(s.win_rate_30d * 100)}%`}
                        </p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">
                          Win rate 30d{s && s.decided_30d > 0 ? ` (${s.decided_30d})` : ""}
                        </p>
                      </div>
                      <div className="rounded-xl bg-brand-50/70 px-2 py-2">
                        <p className="font-display text-base font-bold tabular-nums text-slate-900">{s?.routed_today ?? 0}</p>
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">Assigned today</p>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {pending.length > 0 && (
        <div>
          <h3 className="mb-3 font-semibold text-slate-900">Pending invites <span className="text-slate-400">({pending.length})</span></h3>
          {resent && <InviteLink {...resent} />}
          <Card className="mt-3 divide-y divide-slate-100">
            {pending.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar id={row.id} name={row.email} muted />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{row.email}</p>
                    {row.invite_expired ? (
                      <p className="text-xs font-medium text-amber-700">Link expired (invites last 7 days) · press Resend for a new one</p>
                    ) : (
                      <p className="text-xs text-slate-400">Invited {timeAgo(row.invited_at)} · waiting to join · link valid 7 days</p>
                    )}
                  </div>
                </div>
                <div className={clsx("flex flex-wrap items-center gap-2")}>
                  <ResendButton email={row.email} onDone={setResent} />
                  <RemoveButton row={row} onRemoved={reload} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}

      <CloseAgency name={agency.name} />
    </div>
  );
}
