import { Gauge, Sparkles, Target, Users } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "./ui";

const points = [
  { icon: Target, title: "Top 5 matches, explained", text: "Every job gets a 0-100 Match Score with the reason behind it." },
  { icon: Sparkles, title: "AI proposal drafts", text: "Start each proposal from a draft built on your real skills." },
  { icon: Users, title: "Agency Mode", text: "Route each job to the teammate who fits it best." },
  { icon: Gauge, title: "Skill Gap Radar", text: "See which skill would unlock the most new jobs." },
];

/** Split-screen layout for login/register: brand panel on the left, form on the right. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="relative hidden w-[44%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/5" />
        <Logo light />
        <div className="relative">
          <h2 className="text-3xl font-semibold leading-tight">Find the freelance jobs that actually fit you.</h2>
          <ul className="mt-8 space-y-5">
            {points.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 rounded-lg bg-white/15 p-2">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="text-sm text-brand-100">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-200">Final Year Project · FitWork</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Logo className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
