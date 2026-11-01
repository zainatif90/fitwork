/**
 * Public landing page ("/"). Everything here is true: the sources we really use, the real Match Score
 * formula, and preview cards that are clearly labelled as examples (no invented users or numbers).
 */
import { ArrowRight, Building2, CheckCircle2, Gauge, LineChart, Radar, ShieldCheck, Sparkles, Target, UserRound, Users, Wand2 } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ScoreRing } from "../components/MatchParts";
import { Aurora, Reveal, RotatingWords, Tilt } from "../components/Motion";
import { Orb3D } from "../components/Orb3D";
import { Logo } from "../components/ui";
import { useAuth } from "../lib/auth";

const SOURCES = ["Freelancer.com", "Himalayas", "Remotive", "Jobicy", "Paste any job"];

const FEATURES: { icon: typeof Target; title: string; text: string; tint: string }[] = [
  { icon: Target, title: "Explainable Match Score",
    text: "Every job gets a 0-100 score with a one-line reason, the skills you match and the ones you miss.",
    tint: "from-indigo-500 to-violet-500" },
  { icon: Wand2, title: "AI proposal drafts",
    text: "A first draft written only from your real profile, in the tone and length you choose. Never invented experience.",
    tint: "from-fuchsia-500 to-pink-500" },
  { icon: Users, title: "Agency Mode",
    text: "Invite your team. FitWork scores every member for every job and routes it to the best fit.",
    tint: "from-sky-500 to-cyan-500" },
  { icon: Radar, title: "Skill Gap Radar",
    text: "See which skill from your own field would unlock the most new jobs, measured by re-scoring every job.",
    tint: "from-emerald-500 to-teal-500" },
];

const STEPS = [
  { icon: UserRound, title: "Tell us what you do", text: "Your skills, rate and a short bio. Two minutes." },
  { icon: LineChart, title: "We read every new job", text: "NLP embeddings compare each live job with your profile." },
  { icon: CheckCircle2, title: "Apply to the best 5", text: "Ranked, explained, with a proposal draft ready." },
];

function PreviewCard({ score, title, meta, reason, className }: { score: number; title: string; meta: string; reason: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-4 rounded-2xl border border-white/60 bg-white/95 p-4 text-slate-900 shadow-2xl ${className ?? ""}`}>
      <ScoreRing score={score} size={60} label={false} />
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500">{meta}</p>
        <p className="truncate font-display font-bold">{title}</p>
        <p className="truncate text-xs text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

function Section({ id, eyebrow, title, children }: { id?: string; eyebrow: string; title: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 px-4 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-brand-600">{eyebrow}</p>
          <h2 className="mx-auto mt-3 max-w-2xl text-balance text-center text-3xl font-extrabold text-slate-900 sm:text-4xl">{title}</h2>
        </Reveal>
        <div className="mt-14">{children}</div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { status } = useAuth();
  const loggedIn = status === "authenticated";

  return (
    <div className="min-h-full bg-white">
      {/* ---------- Hero ---------- */}
      <header className="bg-hero relative overflow-hidden text-white">
        <Aurora />
        <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />

        <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
          <Logo light />
          <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#score" className="hover:text-white">Match Score</a>
          </div>
          <div className="flex items-center gap-2">
            {loggedIn ? (
              <Link to="/app" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-brand-50">Open dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-medium text-slate-200 hover:text-white">Log in</Link>
                <Link to="/register" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow hover:bg-brand-50">Get started</Link>
              </>
            )}
          </div>
        </nav>

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pb-24 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pb-32 lg:pt-20">
          <div className="animate-fade-up min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-100 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" /> NLP job matching for freelancers and agencies
            </span>
            <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] sm:text-5xl lg:text-6xl">
              Stop scrolling job boards.{" "}
              <span className="text-gradient-animated">Get the jobs that fit</span>
              <br />
              <RotatingWords className="text-gradient-animated" words={["developers.", "designers.", "writers.", "agencies.", "you."]} />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              FitWork reads live freelance jobs, compares each one with your skills, and shows your best 5 with an
              explainable Match Score and an AI proposal draft ready to edit.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to={loggedIn ? "/app" : "/register"}
                className="group shine btn-3d inline-flex items-center gap-2 rounded-xl bg-gradient-animated px-6 py-3.5 font-semibold text-white transition">
                {loggedIn ? "Go to my matches" : "Find my matches, free"}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a href="#how" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 font-semibold text-white hover:bg-white/10">
                See how it works
              </a>
            </div>
            <p className="mt-8 flex items-center gap-2 text-sm text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Real jobs only. Your password is hashed; your data is never sold.
            </p>
          </div>

          {/* Product preview: illustrative examples */}
          <div className="relative mx-auto w-full min-w-0 max-w-md lg:mx-0">
            <div className="absolute -inset-8 rounded-[2rem] bg-gradient-to-tr from-brand-600/30 via-violet-500/20 to-fuchsia-500/20 blur-2xl" aria-hidden />
            <Orb3D size={320} className="absolute -right-24 -top-24 hidden opacity-80 lg:block" />
            <Tilt className="relative" max={10}>
            <div className="deck-3d space-y-4">
              <PreviewCard className="animate-fade-in" score={94} title="React dashboard for a SaaS startup" meta="#1 · Freelancer.com · 2h ago"
                reason="Matches your React and TypeScript skills; budget fits your rate" />
              <PreviewCard className="animate-fade-in [animation-delay:150ms] sm:ml-10" score={81} title="Next.js landing page redesign" meta="#2 · Himalayas · 5h ago"
                reason="Similar to the work in your profile" />
              <PreviewCard className="animate-fade-in [animation-delay:300ms]" score={63} title="Shopify theme with React widgets" meta="#3 · Remotive · 1 day ago"
                reason="Partly fits: adding Shopify would raise this score" />
            </div>
            </Tilt>
            <div className="animate-float absolute -right-3 -top-6 hidden rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-white shadow-xl backdrop-blur sm:block">
              <span className="text-emerald-400">✓</span> AI proposal ready
            </div>
            <div className="animate-float absolute -bottom-6 -left-4 hidden rounded-xl border border-white/15 bg-slate-900/80 px-3 py-2 text-xs text-white shadow-xl backdrop-blur [animation-delay:1.5s] sm:block">
              Skill gap: <span className="font-semibold text-fuchsia-300">+ Next.js</span>
            </div>
            <p className="mt-10 text-center text-[11px] text-slate-500">Example preview</p>
          </div>
        </div>
      </header>

      {/* ---------- Sources ---------- */}
      <div className="border-b border-slate-100 bg-white py-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">Live jobs from</p>
        <div className="relative mt-4 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
          <div className="animate-marquee flex w-max gap-16">
            {[...SOURCES, ...SOURCES, ...SOURCES, ...SOURCES].map((src, i) => (
              <span key={i} className="font-display text-2xl font-bold text-slate-300 transition hover:text-brand-600">{src}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- Features ---------- */}
      <Section id="features" eyebrow="Features" title="Everything a freelancer needs to pick the right jobs">
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, text, tint }, i) => (
            <Reveal key={title} delay={i * 120}>
              <Tilt className="h-full">
                <div className="group h-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-soft transition duration-300 hover:border-brand-200 hover:shadow-lift">
                  <span className={`inline-flex rounded-2xl bg-gradient-to-br ${tint} p-3 text-white shadow-lg transition duration-500 group-hover:rotate-[360deg] group-hover:scale-110`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-5 text-xl font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 leading-relaxed text-slate-600">{text}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </Section>

      {/* ---------- How it works ---------- */}
      <div className="bg-slate-50">
        <Section id="how" eyebrow="How it works" title="From profile to proposal in three steps">
          <div className="grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <Reveal key={title} delay={i * 150} className="h-full">
              <div className="relative h-full rounded-3xl border border-slate-200/80 bg-white p-7 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-lift">
                <span className="text-gradient-animated font-display text-5xl font-extrabold">0{i + 1}</span>
                <Icon className="absolute right-7 top-8 h-6 w-6 text-brand-500" />
                <h3 className="mt-3 text-lg font-bold text-slate-900">{title}</h3>
                <p className="mt-1.5 text-slate-600">{text}</p>
              </div>
              </Reveal>
            ))}
          </div>
        </Section>
      </div>

      {/* ---------- Match Score ---------- */}
      <Section id="score" eyebrow="Transparent by design" title="A score you can explain, not a black box">
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-2">
          <Reveal className="space-y-5">
            {[
              { label: "Skill & meaning similarity", pct: 70, color: "bg-brand-gradient", note: "MiniLM embeddings compare the job text with your profile" },
              { label: "Budget fit", pct: 15, color: "bg-emerald-500", note: "Compared with your hourly rate" },
              { label: "Freshness", pct: 15, color: "bg-amber-400", note: "Newer jobs have fewer competing proposals" },
            ].map((p) => (
              <div key={p.label}>
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold text-slate-900">{p.label}</span>
                  <span className="font-display text-xl font-bold text-slate-900">{p.pct}%</span>
                </div>
                <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full rounded-full ${p.color}`} style={{ width: `${p.pct}%` }} />
                </div>
                <p className="mt-1.5 text-sm text-slate-500">{p.note}</p>
              </div>
            ))}
          </Reveal>
          <Reveal delay={150}>
          <div className="glow-border rounded-3xl p-8 shadow-lift">
            <div className="flex items-center gap-5">
              <ScoreRing score={88} size={104} />
              <div>
                <p className="text-sm font-medium text-slate-500">Example</p>
                <p className="font-display text-xl font-bold text-slate-900">Python API for an inventory app</p>
              </div>
            </div>
            <ul className="mt-6 space-y-2 text-sm text-slate-700">
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> Matches your Python, Django and PostgreSQL skills</li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> Budget fits your rate</li>
              <li className="flex gap-2"><Gauge className="h-4 w-4 shrink-0 text-amber-500" /> Missing: Docker (the Skill Gap Radar shows what it would unlock)</li>
            </ul>
            <p className="mt-6 rounded-xl bg-white/70 p-3 text-xs text-slate-500">
              It's a fit score, not a promise you will win the job. Your won / lost feedback is saved for a future learned model.
            </p>
          </div>
          </Reveal>
        </div>
      </Section>

      {/* ---------- CTA ---------- */}
      <section className="px-4 pb-20 sm:px-8">
        <Reveal>
        <div className="bg-hero relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-16 text-center text-white sm:px-12">
          <Aurora />
          <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_70%)]" />
          <h2 className="relative mx-auto max-w-2xl text-balance text-3xl font-extrabold sm:text-4xl">
            Your next client is already posting. <span className="text-gradient-animated">Be the first good fit.</span>
          </h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to={loggedIn ? "/app" : "/register"} className="shine inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-brand-50">
              {loggedIn ? "Go to my matches" : "Create a free account"} <ArrowRight className="h-4 w-4" />
            </Link>
            {!loggedIn && (
              <Link to="/register?type=agency" className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-6 py-3.5 font-semibold hover:bg-white/10">
                <Building2 className="h-4 w-4" /> I run an agency
              </Link>
            )}
          </div>
        </div>
        </Reveal>
      </section>

      <footer className="border-t border-slate-100 px-4 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
          <Logo />
          <p>FitWork · Final Year Project · Jobs link back to their original posting</p>
        </div>
      </footer>
    </div>
  );
}
