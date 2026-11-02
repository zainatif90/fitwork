/**
 * Owner's pipeline board: every assigned job in a column by status (Assigned -> Applied -> Won / Lost).
 * Members move their own jobs forward; the owner watches progress here and can take a job back
 * or give it to someone else while nobody has applied yet.
 * Column counts come from the server totals (all assignments); the cards show the latest 100.
 */
import clsx from "clsx";
import { MessageSquare, MoreHorizontal, Undo2, UserRoundCog } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api, ApiError } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import type { Assignment, AssignmentStatus, TeamStats } from "../../lib/types";
import { Button } from "../ui";
import { Avatar, ClosedBadge, STATUS_META, ScorePill } from "./parts";

const COLUMNS: { status: AssignmentStatus; hint: string }[] = [
  { status: "assigned", hint: "Waiting for the teammate to apply" },
  { status: "applied", hint: "Proposal sent, waiting for the client" },
  { status: "won", hint: "Client hired your teammate" },
  { status: "lost", hint: "Client chose someone else" },
];

export interface Assignee {
  id: string;
  name: string;
}

function CardActions({ a, assignees, onChanged, onError, onClose }: {
  a: Assignment; assignees: Assignee[]; onChanged: (msg: string) => Promise<void>; onError: (msg: string) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const others = assignees.filter((p) => p.id !== a.member_id);
  const [to, setTo] = useState(others[0]?.id ?? "");
  const closed = a.job.is_active === false;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    try {
      await fn();
      onClose();
      await onChanged(msg);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Could not update this job.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-2.5">
      {a.status === "assigned" && !closed && others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={`re-${a.id}`} className="sr-only">Give to</label>
          <select id={`re-${a.id}`} value={to} onChange={(e) => setTo(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs">
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button size="sm" loading={busy} icon={<UserRoundCog className="h-3.5 w-3.5" />}
            onClick={() => run(() => api(`/agency/assignments/${a.id}/reassign`, { method: "POST", body: { member_id: to } }),
              `"${a.job.title}" now goes to ${others.find((p) => p.id === to)?.name}.`)}>
            Reassign
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="danger" loading={busy} icon={<Undo2 className="h-3.5 w-3.5" />}
          onClick={() => run(() => api(`/agency/assignments/${a.id}`, { method: "DELETE" }),
            closed ? `"${a.job.title}" was removed.` : `"${a.job.title}" was taken back and is in Routing again.`)}>
          Take back
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}

function PipelineCard({ a, assignees, onChanged, onError }: {
  a: Assignment; assignees: Assignee[]; onChanged: (msg: string) => Promise<void>; onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const live = a.status === "assigned" || a.status === "applied";
  const closed = a.job.is_active === false && live;
  return (
    <li className={clsx("rounded-xl border bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
      closed ? "border-slate-300 opacity-80" : "border-slate-200/80")}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/app/jobs/${a.job.id}`} className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-brand-700">
          {a.job.title}
        </Link>
        {closed && <ClosedBadge />}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar id={a.member_id} name={a.member_name} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-slate-700">{a.member_name}</span>
            <span className="block text-[11px] text-slate-400">{timeAgo(a.updated_at)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {a.score != null && <ScorePill score={a.score} />}
          <Link to={`/app/chat?c=job-${a.job.id}`} aria-label={`Discuss ${a.job.title} with ${a.member_name}`} title="Discuss"
            className="rounded-lg p-1 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700">
            <MessageSquare className="h-4 w-4" />
          </Link>
          {live && (
            <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={`Manage ${a.job.title}`} title="Reassign or take back"
              className="rounded-lg p-1 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
      {open && <CardActions a={a} assignees={assignees} onChanged={onChanged} onError={onError} onClose={() => setOpen(false)} />}
    </li>
  );
}

export function Pipeline({ assignments, totals, assignees, onChanged, onError }: {
  assignments: Assignment[];
  totals: TeamStats["totals"];
  assignees: Assignee[];
  onChanged: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const shown = assignments.filter((a) => a.status !== "declined").length;
  const total = totals.assigned + totals.applied + totals.won + totals.lost;
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        {COLUMNS.map((col) => {
          const items = assignments.filter((a) => a.status === col.status);
          const meta = STATUS_META[col.status];
          return (
            <section key={col.status} className="flex flex-col rounded-2xl border border-white/70 bg-white/70 p-3 shadow-soft ring-1 ring-brand-100/50 backdrop-blur">
              <header className="flex items-center justify-between px-1 pb-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span className={clsx("h-2.5 w-2.5 rounded-full", meta.dot)} /> {meta.label}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold tabular-nums text-slate-600">
                  {totals[col.status as keyof typeof totals]}
                </span>
              </header>
              <p className="px-1 pb-3 text-[11px] text-slate-500">{col.hint}</p>
              <ul className="stagger-children flex-1 space-y-2">
                {items.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">Nothing here yet</li>
                )}
                {items.map((a) => <PipelineCard key={a.id} a={a} assignees={assignees} onChanged={onChanged} onError={onError} />)}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="mt-3 space-y-1 text-xs text-slate-500">
        {shown < total && <p>Showing the latest {shown} of {total} jobs. The numbers at the top of each column count all of them.</p>}
        {totals.declined > 0 && (
          <p>{totals.declined} job{totals.declined === 1 ? " was" : "s were"} declined by a teammate and went back to Routing for the next best person.</p>
        )}
      </div>
    </div>
  );
}
