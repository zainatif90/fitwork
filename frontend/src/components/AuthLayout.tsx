import { Gauge, Sparkles, Target, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ScoreRing } from "./MatchParts";
import { Aurora } from "./Motion";
import { Orb3D } from "./Orb3D";
import { Logo } from "./ui";

const points = [
  { icon: Target, title: "Top 5 matches, explained", text: "A 0-100 Match Score with the reason behind it." },
  { icon: Sparkles, title: "AI proposal drafts", text: "Built only from your real skills and portfolio." },
  { icon: Users, title: "Agency Mode", text: "Each job goes to the teammate who fits it best." },
  { icon: Gauge, title: "Skill Gap Radar", text: "The one skill that unlocks the most jobs in your field." },
];

/** Split-screen layout for login/register: brand panel on the left, form on the right. */
export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full bg-white">
      <aside className="bg-hero relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <Aurora />
        <Orb3D size={260} className="absolute -right-20 top-24 opacity-70" />
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        <Link to="/" className="relative w-fit"><Logo light /></Link>

        <div className="relative">
          <h2 className="text-4xl font-extrabold leading-tight">
            Find the freelance jobs <span className="text-gradient-animated">that actually fit you.</span>
          </h2>

          {/* Product preview (illustrative example, not real data) */}
          <div className="animate-float mt-8 max-w-sm rounded-2xl border border-white/10 bg-white/[0.07] p-4 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-white p-1"><ScoreRing score={92} size={56} label={false} /></div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wider text-brand-200">Example match</p>
                <p className="truncate font-semibold">React dashboard for a SaaS startup</p>
                <p className="text-xs text-brand-100">Matches your React and TypeScript skills · budget fits your rate</p>
              </div>
            </div>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5">
            {points.map(({ icon: Icon, title: t, text }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 h-fit rounded-xl bg-white/10 p-2 ring-1 ring-white/15">
                  <Icon className="h-4 w-4 text-brand-200" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{t}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-300">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">Live jobs from Freelancer.com, Himalayas, Remotive and Jobicy</p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="animate-fade-up w-full max-w-md">
          <Link to="/" className="mb-8 block w-fit lg:hidden"><Logo /></Link>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
