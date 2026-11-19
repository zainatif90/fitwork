/*
 * The pictures of the "How FitWork works" story (the words are in narration.json). Each scene is a timeline:
 * every element has a delay (at(d), in seconds, stretched to the narration by the story clock) and an animation
 * class from story.css. Positions are in the 960 x 560 stage.
 * Illustrative story: the people, jobs and numbers are examples; the steps are exactly what FitWork does.
 */
import { Briefcase, Check, Clock, Database, Lock, Mail, MessageCircle, Sparkles, Trophy } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Orb3D } from "../Orb3D";
import { LogoMark } from "../ui";
import { type Mood, SaraPortrait } from "./SaraPortrait";
import { at, LOOKS, Person, Ring, Typed } from "./StoryParts";

/** seconds = length of the animation (it is stretched when the narration is longer) */
export type Visual = { seconds: number; render: () => ReactNode };

/** Sara's portrait at (x, y) = top-left, on a soft spotlight */
function Sara({ x, y, size = 230, moods, laptop, d = 0 }: { x: number; y: number; size?: number; moods: [Mood, number][]; laptop?: boolean; d?: number }) {
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <span className="st-spot st-fade" style={{ left: -size * 0.25, top: -size * 0.15, width: size * 1.5, height: size * 1.4, ...at(d) }} />
      <div className="st-rise relative" style={at(d)}>
        <SaraPortrait moods={moods} size={size} laptop={laptop} />
      </div>
    </div>
  );
}

function Label({ x, y, d, children, className = "" }: { x: number; y: number; d: number; children: ReactNode; className?: string }) {
  return (
    <div className={`st-pop absolute ${className}`} style={{ left: x, top: y, ...at(d) }}>
      <span className="st-chip bg-white/15 text-white ring-1 ring-white/25">{children}</span>
    </div>
  );
}

function Hub({ x, y, size, d, label }: { x: number; y: number; size: number; d: number; label: string }) {
  return (
    <div className="absolute" style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}>
      <div className="st-pop relative h-full w-full" style={at(d)}>
        <Orb3D size={size} className="absolute inset-0" />
      </div>
      <div className="st-fade absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-center text-sm font-bold text-amber-200" style={at(d + 0.4)}>
        {label}
      </div>
    </div>
  );
}

/* ---------------- Sara's problem ---------------- */
function SceneProblem() {
  const platforms: [string, number, number, number][] = [
    ["Upwork", 470, 70, -6], ["Freelancer.com", 640, 120, 4], ["LinkedIn", 800, 70, -3], ["Fiverr", 520, 190, 5],
    ["Indeed", 760, 200, -5], ["Remotive", 600, 270, -2], ["Himalayas", 820, 300, 6], ["Jobicy", 470, 300, 3],
  ];
  return (
    <>
      <Sara x={70} y={150} size={250} moods={[["neutral", 0], ["focused", 1.6], ["confused", 3.6], ["stressed", 6.4]]} />
      <div className="absolute flex gap-1.5" style={{ left: 60, top: 70 }}>
        {["React", "TypeScript", "Node.js"].map((s, i) => (
          <span key={s} className="st-pop st-chip bg-white text-brand-800 shadow-lg" style={at(0.6 + i * 0.25)}><Check className="h-3 w-3 text-emerald-500" />{s}</span>
        ))}
      </div>
      {platforms.map(([name, x, y, r], i) => (
        <div key={name} className="absolute" style={{ left: x, top: y, transform: `rotate(${r}deg)` }}>
          <div className="st-pop" style={at(2.2 + i * 0.3)}>
            <span className="st-chip bg-white/10 text-white ring-1 ring-white/25" style={{ fontSize: 14, padding: "8px 14px" }}>{name}</span>
          </div>
        </div>
      ))}
      {[[590, 175], [745, 160], [735, 285]].map(([x, y], i) => (
        <span key={i} className="st-pop absolute flex h-8 w-8 items-center justify-center rounded-full bg-amber-300 font-display text-lg font-extrabold text-amber-900"
          style={{ left: x, top: y, ...at(4 + i * 0.5) }}>?</span>
      ))}
      {/* job posts pile up */}
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="absolute" style={{ left: 500 + (i % 4) * 95, top: 370 + Math.floor(i / 4) * 40, transform: `rotate(${((i * 7) % 11) - 5}deg)` }}>
          <div className="st-drop st-card px-3 py-2" style={{ position: "relative", width: 150, ...at(5 + i * 0.25) }}>
            <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-slate-400" /><span className="block h-2 w-20 rounded bg-slate-300" /></span>
            <span className="mt-1.5 block h-2 w-16 rounded bg-slate-200" />
          </div>
        </div>
      ))}
      <div className="absolute flex gap-2" style={{ left: 500, top: 490 }}>
        <span className="st-pop st-chip bg-rose-500 text-white" style={at(7.2)}>248 new posts today</span>
        <span className="st-pop st-chip bg-white/15 text-white" style={at(7.8)}><Clock className="h-3.5 w-3.5" /> 3 hours of scrolling</span>
      </div>
    </>
  );
}

/* ---------------- She finds FitWork ---------------- */
function SceneDiscover() {
  return (
    <>
      <Sara x={70} y={150} size={250} moods={[["stressed", 0], ["curious", 1.6], ["hopeful", 4]]} />
      <div className="st-rise st-card p-4" style={{ left: 380, top: 80, width: 300, ...at(0.6) }}>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><MessageCircle className="h-4 w-4 text-brand-600" /> Message from a friend</div>
        <p className="mt-2 min-h-[66px] text-[15px] leading-relaxed text-slate-800"><Typed text="Have you tried FitWork? It shows you the jobs that fit you, and tells you why." delay={1} speed={30} /></p>
      </div>
      <div className="absolute" style={{ left: 700, top: 190, width: 180, height: 180 }}>
        <span className="st-ring absolute rounded-full border-2 border-amber-200/60" style={{ left: 90, top: 90, width: 360, height: 360, ...at(3.6) }} />
        <div className="st-pop" style={at(3.2)}><LogoMark className="h-[180px] w-[180px]" /></div>
      </div>
      <div className="st-rise absolute text-center" style={{ left: 650, top: 395, width: 280, ...at(3.9) }}>
        <p className="font-display text-4xl font-extrabold text-white">Fit<span className="bg-[linear-gradient(90deg,#fde68a,#f9a8d4)] bg-clip-text text-transparent">Work</span></p>
        <p className="mt-1 text-sm font-semibold text-amber-100">The right jobs, explained.</p>
      </div>
    </>
  );
}

/* ---------------- She signs up ---------------- */
function SceneSara() {
  const skills = ["React", "TypeScript", "Node.js", "PostgreSQL"];
  return (
    <>
      <Sara x={60} y={160} size={250} laptop moods={[["hopeful", 0], ["focused", 1.4], ["happy", 5.6]]} />
      <div className="st-rise st-card p-5" style={{ left: 520, top: 110, width: 360, ...at(1) }}>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Sara's FitWork profile</p>
        <p className="mt-3 text-xs font-semibold text-slate-500">Skills</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {skills.map((s, i) => (
            <span key={s} className="st-pop st-chip bg-brand-100 text-brand-800" style={at(1.8 + i * 0.35)}>{s}</span>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="st-rise" style={at(3.4)}><p className="text-xs font-semibold text-slate-500">Experience</p><p className="font-bold">Intermediate</p></div>
          <div className="st-rise" style={at(3.9)}><p className="text-xs font-semibold text-slate-500">Hourly rate</p><p className="font-bold">$30 / hour</p></div>
        </div>
        <p className="st-rise mt-3 text-xs leading-relaxed text-slate-600" style={at(4.5)}>“I build fast dashboards with React, TypeScript and Node.js APIs.”</p>
        <span className="st-pop absolute -right-3 -top-3 st-chip bg-emerald-500 text-white shadow-lg" style={at(5.4)}><Check className="h-3.5 w-3.5" /> Saved</span>
      </div>
    </>
  );
}

/* ---------------- 2. Employers post jobs everywhere ---------------- */
function SceneSources() {
  const clients = [
    { x: 150, y: 235, look: LOOKS.employer, site: "Freelancer.com", job: "React dashboard", pay: "$30-45/hr" },
    { x: 150, y: 480, look: LOOKS.employer2, site: "Himalayas", job: "Node.js API", pay: "$2,000 fixed" },
    { x: 810, y: 235, look: LOOKS.employer3, site: "Remotive", job: "Logo design", pay: "$400 fixed" },
    { x: 810, y: 480, look: LOOKS.employer4, site: "Jobicy", job: "Python scraper", pay: "$25/hr" },
  ];
  return (
    <>
      <Hub x={480} y={290} size={150} d={0.2} label="FitWork" />
      {clients.map((c, i) => (
        <div key={c.site}>
          <Person x={c.x} y={c.y} look={c.look} size={66} tie name={c.site} d={0.4 + i * 0.3} bob={i * 0.4} />
          {/* job card: pops above the client, then flies into FitWork */}
          <div className="absolute" style={{ left: c.x - 75, top: c.y - 160 }}>
            <div className="st-out" style={at(3.6 + i * 0.35, { tx: 480 - c.x, ty: 290 - (c.y - 140) })}>
              <div className="st-pop st-card px-3 py-2" style={{ position: "relative", width: 150, ...at(1.6 + i * 0.3) }}>
                <p className="truncate text-xs font-bold">{c.job}</p>
                <p className="text-[11px] font-semibold text-emerald-600">{c.pay}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
      <Label x={330} y={40} d={5.4}><Database className="h-3.5 w-3.5" /> Thousands of jobs, collected automatically</Label>
      <Label x={370} y={78} d={6}><Clock className="h-3.5 w-3.5" /> New jobs every 30 minutes to a few hours</Label>
    </>
  );
}

/* ---------------- 3. AI reads every job ---------------- */
function SceneMeaning() {
  const nums = ["0.12", "-0.07", "0.31", "0.04", "-0.22", "0.18", "0.09", "-0.15"];
  return (
    <>
      <div className="absolute" style={{ left: 60, top: 120 }}>
        <div className="st-out" style={at(2.4, { tx: 330, ty: 120 })}>
          <div className="st-slide-l st-card p-4" style={{ position: "relative", width: 250, ...at(0.2) }}>
            <p className="text-sm font-bold">React dashboard for a SaaS startup</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">We need a React + TypeScript developer to build charts and filters for our analytics app…</p>
          </div>
        </div>
      </div>
      <Hub x={470} y={270} size={170} d={0.5} label="AI language model (MiniLM)" />
      <div className="st-rise st-card p-4" style={{ left: 680, top: 80, width: 220, ...at(3) }}>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Meaning as numbers</p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm">
          {nums.map((n, i) => <span key={i} className="st-fade" style={at(3.4 + i * 0.15)}>{n}</span>)}
        </div>
        <p className="st-fade mt-2 text-xs font-semibold text-slate-500" style={at(4.8)}>… 384 numbers in total</p>
      </div>
      {/* the job and Sara become points: close meaning = close points */}
      <div className="st-fade absolute rounded-2xl border border-white/15 bg-white/5" style={{ left: 600, top: 370, width: 300, height: 120, ...at(5.4) }}>
        <span className="absolute left-3 top-2 text-xs font-semibold text-white/70">meaning space</span>
        <span className="st-pop st-dot big" style={{ left: 130, top: 70, "--c": "#fbbf24", ...at(5.8) } as React.CSSProperties} />
        <span className="st-fade absolute text-xs font-bold text-amber-200" style={{ left: 100, top: 86, ...at(6) }}>this job</span>
        <span className="st-pop st-dot big" style={{ left: 175, top: 52, "--c": "#f472b6", ...at(6.8) } as React.CSSProperties} />
        <span className="st-fade absolute text-xs font-bold text-pink-200" style={{ left: 190, top: 34, ...at(7) }}>Sara</span>
        <span className="st-fade absolute text-xs text-white/70" style={{ left: 150, top: 92, ...at(7.4) }}>close = similar</span>
      </div>
      <Person x={150} y={480} look={LOOKS.sara} size={70} name="Sara's profile too" anim="st-slide-l" d={4.4} />
    </>
  );
}

/* ---------------- 4. Finding the closest jobs ---------------- */
// Deterministic "random" points for the job cloud, kept away from the centre (Sara)
const CLOUD = (() => {
  const pts: [number, number][] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  while (pts.length < 34) {
    const x = 30 + rnd() * 640;
    const y = 30 + rnd() * 320;
    if (Math.hypot(x - 350, y - 190) > 110) pts.push([x, y]);
  }
  return pts;
})();
const NEAREST: [number, number][] = [[290, 140], [420, 150], [440, 240], [300, 250], [365, 110]];

function SceneSearch() {
  return (
    <>
      <div className="absolute" style={{ left: 130, top: 60, width: 700, height: 380, perspective: "900px" }}>
        <div className="st-fade relative h-full w-full rounded-3xl border border-white/15 bg-white/[0.04]"
          style={{ transform: "rotateX(48deg)", transformOrigin: "50% 60%", ...at(0) }}>
          {CLOUD.map(([x, y], i) => (
            <span key={i} className="absolute" style={{ left: x, top: y }}>
              <span className="st-pop block" style={at(0.2 + (i % 10) * 0.05)}>
                <span className="st-dim block" style={at(2.6)}><span className="st-dot" style={{ position: "relative", display: "block" }} /></span>
              </span>
            </span>
          ))}
          <svg className="absolute inset-0 h-full w-full overflow-visible">
            {NEAREST.map(([x, y], i) => (
              <line key={i} x1={350} y1={190} x2={x} y2={y} stroke="#fde68a" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray="200" strokeDashoffset="200" style={{ animation: `st-draw 0.6s ease-out calc(var(--k, 1) * ${2.8 + i * 0.25}s) forwards` }} />
            ))}
            <style>{"@keyframes st-draw { to { stroke-dashoffset: 0; } }"}</style>
          </svg>
          {NEAREST.map(([x, y], i) => (
            <span key={i} className="absolute" style={{ left: x, top: y }}>
              <span className="st-pop block" style={at(0.3)}>
                <span className="st-lit block" style={at(2.8 + i * 0.25)}><span className="st-dot big" style={{ position: "relative", display: "block", "--c": "#fbbf24" } as React.CSSProperties} /></span>
              </span>
            </span>
          ))}
          <span className="st-ring absolute rounded-full border-2 border-pink-300" style={{ left: 350, top: 190, width: 300, height: 300, ...at(1) }} />
          <span className="st-pop st-dot big" style={{ left: 350, top: 190, "--c": "#f472b6", width: 28, height: 28, margin: "-14px 0 0 -14px", ...at(0.6) } as React.CSSProperties} />
        </div>
      </div>
      <Label x={60} y={40} d={1.2}><span className="h-2.5 w-2.5 rounded-full bg-pink-400" /> Sara</Label>
      <Label x={60} y={78} d={3.2}><span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> The closest jobs in meaning</Label>
      <Label x={560} y={460} d={4.4}><Database className="h-3.5 w-3.5" /> PostgreSQL + pgvector: 50 closest jobs in milliseconds</Label>
      <Label x={640} y={498} d={5.6}><Sparkles className="h-3.5 w-3.5" /> then scored, best 5 shown</Label>
    </>
  );
}

/* ---------------- 5. Match Score ---------------- */
function SceneScore() {
  const parts = [
    { label: "70%  Skills & meaning", w: 0.92, value: "strong" },
    { label: "15%  Budget fits $30/hr", w: 1, value: "fits" },
    { label: "15%  Freshness", w: 0.85, value: "3 h ago" },
  ];
  return (
    <>
      <Sara x={20} y={200} size={210} moods={[["focused", 0], ["curious", 2.6], ["happy", 6.4]]} />
      <div className="st-rise st-card p-6" style={{ left: 330, top: 50, width: 590, ...at(0.2) }}>
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">#1 match for Sara</p>
            <p className="mt-1 font-display text-xl font-bold">React dashboard for a SaaS startup</p>
            <p className="text-sm font-semibold text-emerald-600">$30-45/hr · posted 3 hours ago</p>
          </div>
          <Ring score={86} delay={0.9} />
        </div>
        <div className="mt-5 space-y-2.5">
          {parts.map((p, i) => (
            <div key={p.label} className="st-fade grid grid-cols-[180px_1fr_60px] items-center gap-3 text-sm" style={at(1.6 + i * 0.4)}>
              <span className="font-semibold text-slate-700">{p.label}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-brand-100">
                <span className="st-grow block h-full rounded-full bg-brand-gradient" style={{ width: `${p.w * 100}%`, ...at(1.8 + i * 0.4) }} />
              </span>
              <span className="text-xs font-semibold text-slate-500">{p.value}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {["React", "TypeScript", "Node.js"].map((s, i) => (
            <span key={s} className="st-pop st-chip bg-emerald-500 text-white" style={at(3.4 + i * 0.25)}><Check className="h-3 w-3" />{s}</span>
          ))}
          <span className="st-pop st-chip bg-slate-100 text-slate-500" style={at(4.2)}>AWS (missing)</span>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          <Typed text="Matches your React and TypeScript skills; budget fits your rate; posted 3 hours ago." delay={4.6} speed={30} />
        </p>
      </div>
      <div className="st-pop st-bubble" style={{ left: 40, top: 70, maxWidth: 240, ...at(7) }}>Clear reasons, not a black box.</div>
    </>
  );
}

/* ---------------- 6. AI proposal draft ---------------- */
const PROPOSAL = "Hi! I'm Sara, a React and TypeScript developer. I build fast dashboards with Node.js APIs and PostgreSQL. " +
  "For your analytics app I would start with the main charts, then add filters and exports. I can start this week.";

function SceneProposal() {
  return (
    <>
      <Sara x={10} y={210} size={220} laptop moods={[["focused", 0], ["hopeful", 6], ["happy", 8.2]]} />
      <div className="st-rise st-card p-5" style={{ left: 290, top: 50, width: 400, ...at(0.4) }}>
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-600"><Sparkles className="h-3.5 w-3.5" /> AI proposal draft</p>
        <p className="mt-3 min-h-[150px] text-[15px] leading-relaxed text-slate-700"><Typed text={PROPOSAL} delay={1} speed={22} /></p>
        <div className="mt-3 flex gap-2">
          <span className="st-pop st-chip bg-slate-100 text-slate-700" style={at(6.8)}>Edit</span>
          <span className="st-pop st-chip bg-brand-gradient text-white" style={at(7)}>Copy</span>
        </div>
      </div>
      <div className="absolute" style={{ left: 760, top: 330 }}>
        <div className="st-fly" style={at(7.6, { fx: -400, fy: -140 })}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-300 text-amber-900 shadow-lg"><Mail className="h-6 w-6" /></span>
        </div>
      </div>
      <Person x={820} y={480} look={LOOKS.employer} size={84} tie name="Client" d={0.6} bob={0.8} />
      <div className="st-pop st-bubble" style={{ left: 712, top: 200, maxWidth: 230, ...at(8.4) }}>Proposal received: relevant and specific.</div>
      <Label x={300} y={490} d={2}>Only Sara's real skills are used · she sends it herself</Label>
    </>
  );
}

/* ---------------- 7. Agency Mode ---------------- */
function SceneAgency() {
  const members = [
    { x: 210, look: LOOKS.ayesha, name: "Ayesha · Design", job: "Logo design", fit: 88 },
    { x: 480, look: LOOKS.sara, name: "Sara · React", job: "React web app", fit: 91 },
    { x: 750, look: LOOKS.bilal, name: "Bilal · Python", job: "Python scraper", fit: 84 },
  ];
  return (
    <>
      <Person x={480} y={190} look={LOOKS.owner} size={80} crown name="Agency owner" anim="st-drop" d={0.2} />
      {members.map((m, i) => (
        <div key={m.name}>
          <Person x={m.x} y={490} look={m.look} size={82} name={m.name} anim="st-rise" d={0.6 + i * 0.25} bob={i * 0.5} />
          {/* each job leaves the owner and lands above the teammate who fits it best */}
          <div className="absolute" style={{ left: m.x - 80, top: 270 }}>
            <div className="st-fly" style={at(2 + i * 1.1, { fx: 480 - m.x, fy: -110 })}>
              <div className="st-card px-3 py-2" style={{ position: "relative", width: 160 }}>
                <p className="truncate text-sm font-bold">{m.job}</p>
                <span className="st-pop st-chip mt-1 bg-emerald-500 text-white" style={at(2.7 + i * 1.1)}><Check className="h-3 w-3" /> best fit · {m.fit}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="st-fade absolute rounded-2xl border border-white/15 bg-white/10 px-4 py-3" style={{ left: 600, top: 30, width: 340, ...at(5.6) }}>
        <div className="relative flex justify-between text-xs font-bold text-white">
          <span>Assigned</span><span>Applied</span><span className="text-amber-300">Won</span>
          <span className="absolute left-2 right-2 top-[calc(100%+10px)] h-0.5 rounded bg-white/25" />
          <span className="st-travel absolute left-1 top-[calc(100%+5px)] h-3 w-3 rounded-full bg-amber-300 shadow-[0_0_10px_2px_rgb(251_191_36/0.8)]" style={at(6.2)} />
        </div>
        <div className="h-4" />
      </div>
      <Label x={40} y={40} d={1.2}>Every job is compared with every teammate</Label>
    </>
  );
}

/* ---------------- 8. Skill Gap Radar ---------------- */
function SceneSkillGap() {
  const bars = [
    { s: "React", h: 150, have: true }, { s: "TypeScript", h: 136, have: true }, { s: "Node.js", h: 110, have: true },
    { s: "AWS", h: 124, have: false }, { s: "Docker", h: 96, have: false }, { s: "Python", h: 82, have: false },
  ];
  return (
    <>
      <Sara x={0} y={230} size={200} moods={[["curious", 0], ["focused", 2], ["proud", 5.2]]} />
      <div className="st-rise st-card p-5" style={{ left: 230, top: 50, width: 440, ...at(0.3) }}>
        <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Skills that jobs in Sara's field ask for</p>
        <div className="mt-4 flex h-[180px] items-end gap-4 border-b border-slate-200 px-2">
          {bars.map((b, i) => (
            <div key={b.s} className="flex flex-1 flex-col items-center justify-end">
              <span className={`st-growy block w-full rounded-t-lg ${b.have ? "bg-emerald-500" : b.s === "AWS" ? "bg-amber-400" : "bg-brand-400"}`}
                style={{ height: b.h, ...at(0.8 + i * 0.2) }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-4 px-2">
          {bars.map((b) => <span key={b.s} className="flex-1 text-center text-xs font-semibold text-slate-600">{b.s}</span>)}
        </div>
        <div className="mt-3 flex gap-2 text-xs font-semibold">
          <span className="st-chip bg-emerald-100 text-emerald-700">✓ Sara has</span>
          <span className="st-chip bg-brand-100 text-brand-700">✗ missing</span>
        </div>
      </div>
      <div className="st-pop st-card p-4" style={{ left: 700, top: 50, width: 230, ...at(3.2) }}>
        <p className="font-display text-lg font-bold">Add <span className="text-amber-500">AWS</span></p>
        <p className="text-sm font-semibold text-emerald-600">→ unlocks 3 more jobs</p>
        <div className="mt-3 space-y-2">
          {["Cloud dashboard", "Serverless API", "SaaS admin panel"].map((j, i) => (
            <div key={j} className="relative flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold">
              <span className="relative h-5 w-5">
                <span className="st-out absolute inset-0 flex items-center justify-center text-slate-400" style={at(4.2 + i * 0.5)}><Lock className="h-4 w-4" /></span>
                <span className="st-pop absolute inset-0 flex items-center justify-center rounded-full bg-emerald-500 text-white" style={at(4.6 + i * 0.5)}><Check className="h-3.5 w-3.5" /></span>
              </span>
              {j}
            </div>
          ))}
        </div>
        <p className="st-fade mt-3 text-xs text-slate-500" style={at(6.4)}>Learn it free: freeCodeCamp, YouTube, Coursera</p>
      </div>
      <Label x={250} y={470} d={2.4}>Each missing skill is tested by re-scoring the jobs in Sara's field</Label>
    </>
  );
}

/* ---------------- Hired ---------------- */
function SceneHired() {
  return (
    <>
      <Sara x={90} y={150} size={260} moods={[["hopeful", 0], ["happy", 1.4], ["proud", 4.5]]} />
      {/* the deal: a line of light joins Sara and the client */}
      <div className="absolute" style={{ left: 380, top: 400, width: 290, height: 3 }}>
        <span className="st-grow block h-full rounded-full bg-gradient-to-r from-pink-400 via-amber-300 to-slate-300 shadow-[0_0_12px_2px_rgb(251_191_36/0.6)]" style={at(1)} />
      </div>
      <Person x={720} y={470} look={LOOKS.employer} size={110} tie name="Client" anim="st-slide-r" d={0.2} bob={0.6} />
      <div className="absolute" style={{ left: 482, top: 170 }}>
        <div className="st-pop" style={at(1.6)}>
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-b from-amber-200 to-amber-500 text-amber-900 shadow-[0_0_40px_10px_rgb(251_191_36/0.45)]">
            <Trophy className="h-12 w-12" />
          </span>
        </div>
      </div>
      <div className="st-rise absolute flex gap-2" style={{ left: 440, top: 60, ...at(2.4) }}>
        <span className="st-chip bg-white/15 text-white">Applied</span>
        <span className="st-chip text-white/60">→</span>
        <span className="st-chip bg-amber-300 text-amber-900">Won</span>
      </div>
      <div className="st-rise st-card px-4 py-3" style={{ left: 640, top: 150, width: 280, ...at(3.6) }}>
        <p className="text-sm font-bold">Sara marks the job “Won”</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">FitWork keeps this feedback to become even smarter in the future.</p>
      </div>
    </>
  );
}

/* ---------------- Finale: the job magnet ---------------- */
const MAGNET_JOBS: [string, number, number][] = [
  ["React app", -520, -260], ["Logo design", 0, -340], ["Node.js API", 520, -250], ["Data analysis", 560, 40],
  ["SEO audit", 500, 300], ["Mobile app", 0, 340], ["Python script", -520, 300], ["UI/UX design", -560, 30],
  ["WordPress site", -300, -330], ["Video editing", 320, 330], ["Copywriting", 330, -330], ["Shopify store", -320, 330],
  ["Data entry", -600, -120], ["Flutter app", 600, -140], ["3D modelling", 600, 200], ["Translation", -600, 180],
];

function SceneOutro() {
  return (
    <>
      {/* glow and pulses behind the logo */}
      <span className="st-spot st-fade" style={{ left: 260, top: -10, width: 440, height: 440, ...at(0) }} />
      {[0, 0.7, 1.4].map((d) => (
        <span key={d} className="st-ring absolute rounded-full border-2 border-amber-200/50" style={{ left: 480, top: 190, width: 460, height: 460, ...at(d) }} />
      ))}
      {/* jobs pulled in from every side, again and again */}
      {MAGNET_JOBS.map(([job, fx, fy], i) => (
        <div key={job} className="absolute" style={{ left: 420, top: 172 }}>
          <span className="st-magnet st-chip bg-white text-slate-800 shadow-lg" style={{ "--fx": `${fx}px`, "--fy": `${fy}px`, animationDelay: `${0.2 + i * 0.26}s` } as CSSProperties}>
            <Briefcase className="h-3.5 w-3.5 text-brand-600" />{job}
          </span>
        </div>
      ))}
      <div className="absolute" style={{ left: 390, top: 100, width: 180, height: 180 }}>
        <div className="st-pop" style={at(0.2)}><LogoMark className="h-[180px] w-[180px]" /></div>
      </div>
      <div className="st-rise absolute text-center" style={{ left: 180, top: 300, width: 600, ...at(1.2) }}>
        <p className="font-display text-6xl font-extrabold tracking-tight text-white">Fit<span className="bg-[linear-gradient(90deg,#fde68a,#f9a8d4)] bg-clip-text text-transparent">Work</span></p>
        <p className="mt-2 text-lg font-semibold text-amber-100">Where the right jobs find you.</p>
      </div>
      <div className="absolute flex w-full justify-center gap-2" style={{ left: 0, top: 440 }}>
        {["Top 5 matches, explained", "AI proposals", "Agency Mode", "Skill Gap Radar"].map((f, i) => (
          <span key={f} className="st-pop st-chip bg-white/12 text-white ring-1 ring-white/25" style={{ fontSize: 13, padding: "7px 12px", ...at(2.6 + i * 0.35) }}>
            <Check className="h-3.5 w-3.5 text-amber-300" />{f}
          </span>
        ))}
      </div>
      <div className="st-fade absolute w-full text-center text-sm font-semibold text-white/70" style={{ left: 0, top: 500, ...at(4.4) }}>
        Free · fitwork-zain2026.web.app
      </div>
    </>
  );
}

/** Pictures for each scene id of narration.json */
export const VISUALS: Record<string, Visual> = {
  problem: { seconds: 10, render: SceneProblem },
  discover: { seconds: 7, render: SceneDiscover },
  sara: { seconds: 7.5, render: SceneSara },
  sources: { seconds: 9, render: SceneSources },
  meaning: { seconds: 9, render: SceneMeaning },
  search: { seconds: 8, render: SceneSearch },
  score: { seconds: 10, render: SceneScore },
  proposal: { seconds: 10, render: SceneProposal },
  agency: { seconds: 10, render: SceneAgency },
  skillgap: { seconds: 9, render: SceneSkillGap },
  hired: { seconds: 7, render: SceneHired },
  outro: { seconds: 9, render: SceneOutro },
};
