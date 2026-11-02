/**
 * Owner's pipeline board: every assigned job in a column by status (Assigned -> Applied -> Won / Lost).
 * Members move their own jobs forward; the owner watches progress here.
 */
import clsx from "clsx";
import { Link } from "react-router-dom";

import { timeAgo } from "../../lib/format";
import type { Assignment, AssignmentStatus } from "../../lib/types";
import { Avatar, STATUS_META, ScorePill } from "./parts";

const COLUMNS: { status: AssignmentStatus; hint: string }[] = [
  { status: "assigned", hint: "Waiting for the teammate to apply" },
  { status: "applied", hint: "Proposal sent, waiting for the client" },
  { status: "won", hint: "Client hired your teammate" },
  { status: "lost", hint: "Client chose someone else" },
];

export function Pipeline({ assignments }: { assignments: Assignment[] }) {
  const declined = assignments.filter((a) => a.status === "declined").length;
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
                <span className="rounded-full bg-slate-100 px-2 text-xs font-semibold tabular-nums text-slate-600">{items.length}</span>
              </header>
              <p className="px-1 pb-3 text-[11px] text-slate-500">{col.hint}</p>
              <ul className="stagger-children flex-1 space-y-2">
                {items.length === 0 && (
                  <li className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">Nothing here yet</li>
                )}
                {items.map((a) => (
                  <li key={a.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <Link to={`/app/jobs/${a.job.id}`} className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-brand-700">
                      {a.job.title}
                    </Link>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar id={a.member_id} name={a.member_name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-slate-700">{a.member_name}</span>
                          <span className="block text-[11px] text-slate-400">{timeAgo(a.updated_at)}</span>
                        </span>
                      </span>
                      {a.score != null && <ScorePill score={a.score} />}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      {declined > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {declined} job{declined === 1 ? " was" : "s were"} declined by a teammate and went back to Routing for the next best person.
        </p>
      )}
    </div>
  );
}
