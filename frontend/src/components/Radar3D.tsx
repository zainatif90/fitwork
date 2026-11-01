/**
 * 3D Skill Gap radar: the radar lies on a tilted "holographic floor" and every skill stands up as a
 * glowing pillar whose height is its demand in the user's field. Green pillar = you have the skill,
 * indigo = missing. The floor slowly turns and follows the mouse.
 *
 * Performance: the rotation is written straight to CSS variables on animation frames (no React
 * re-render per frame), and only transforms are animated, so the browser's graphics card does the work.
 */
import { useEffect, useRef, useState } from "react";

export interface RadarPoint {
  skill: string;
  market_demand: number; // 0-100, scaled so the most requested skill = 100
  jobs: number;
  your_coverage: number; // 100 = the user has this skill
}

const PLANE = 330;                 // floor size in px
const C = PLANE / 2;               // centre
const R = PLANE * 0.4;             // radius of the 100% ring
const MAX_PILLAR = 150;            // pillar height for demand 100
const TILT = 58;                   // floor tilt (degrees)

function point(i: number, n: number, value: number): [number, number] {
  const a = (-90 + (360 / n) * i) * (Math.PI / 180);
  return [C + (R * value) / 100 * Math.cos(a), C + (R * value) / 100 * Math.sin(a)];
}

const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

export function Radar3D({ data }: { data: RadarPoint[] }) {
  const stage = useRef<HTMLDivElement>(null);
  const pillars = useRef<(HTMLDivElement | null)[]>([]);
  const labels = useRef<(HTMLSpanElement | null)[]>([]);
  const [grown, setGrown] = useState(false);
  const n = data.length;

  // Pillars grow up from the floor shortly after the chart appears
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Slow turning + follow the mouse, eased on every animation frame
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rz = -20, rx = TILT, targetX = TILT, hovering = false, mouseRz = 0, frame = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      hovering = true;
      mouseRz = x * 70;
      targetX = TILT - y * 18;
    };
    const onLeave = () => { hovering = false; targetX = TILT; };
    const tick = () => {
      if (!hovering && !reduce) rz += 0.12;
      else if (hovering) rz += (mouseRz - 20 - rz) * 0.06;
      rx += (targetX - rx) * 0.08;
      el.style.setProperty("--rz", `${rz.toFixed(2)}deg`);
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      // Labels live outside the 3D scene (always flat and readable): put each one above its pillar top
      const box = el.getBoundingClientRect();
      pillars.current.forEach((pillar, i) => {
        const label = labels.current[i];
        if (!pillar || !label) return;
        const r = pillar.getBoundingClientRect();
        label.style.transform = `translate(${(r.left + r.width / 2 - box.left).toFixed(1)}px, ${(r.top - box.top - 6).toFixed(1)}px) translate(-50%, -100%)`;
      });
      frame = requestAnimationFrame(tick);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  if (n < 3) return null;
  const demandPts = data.map((d, i) => point(i, n, d.market_demand));
  const coverPts = data.map((d, i) => point(i, n, d.your_coverage ? Math.max(d.market_demand, 25) : 0));

  return (
    <div ref={stage} className="relative mx-auto flex h-[420px] w-full max-w-[460px] cursor-grab items-center justify-center select-none"
      style={{ perspective: "1100px", ["--rz" as string]: "-20deg", ["--rx" as string]: `${TILT}deg` }}>
      {/* soft glow under the floor */}
      <div className="pointer-events-none absolute inset-x-10 bottom-6 h-24 rounded-full bg-gradient-to-r from-brand-500/25 via-fuchsia-500/25 to-sky-400/25 blur-2xl" />

      <div className="relative" style={{ width: PLANE, height: PLANE, transformStyle: "preserve-3d",
        transform: "translateY(40px) rotateX(var(--rx)) rotateZ(var(--rz))", willChange: "transform" }}>
        {/* Floor: rings, spokes, your coverage and the demand shape (stacked a little to look solid) */}
        <svg width={PLANE} height={PLANE} className="absolute inset-0 overflow-visible">
          <defs>
            <radialGradient id="floor-glow">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R * 1.18} fill="url(#floor-glow)" />
          {[25, 50, 75, 100].map((v) => (
            <polygon key={v} points={poly(data.map((_, i) => point(i, n, v)))} fill="none" stroke="#a5b4fc" strokeOpacity={0.55} strokeWidth={1} />
          ))}
          {data.map((_, i) => {
            const [x, y] = point(i, n, 100);
            return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#a5b4fc" strokeOpacity={0.45} />;
          })}
          <polygon points={poly(coverPts)} fill="#ec4899" fillOpacity={0.18} stroke="#ec4899" strokeWidth={2} />
        </svg>
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <svg key={k} width={PLANE} height={PLANE} className="absolute inset-0 overflow-visible"
            style={{ transform: `translateZ(${k * 2.5}px)` }}>
            <polygon points={poly(demandPts)} fill="#6366f1" fillOpacity={k === 5 ? 0.22 : 0.07}
              stroke="#818cf8" strokeOpacity={k === 5 ? 1 : 0.35} strokeWidth={k === 5 ? 2 : 1} />
          </svg>
        ))}

        {/* Pillars: stand up from the floor and always face the viewer */}
        {data.map((d, i) => {
          const [x, y] = point(i, n, d.market_demand);
          const h = Math.max(8, (d.market_demand / 100) * MAX_PILLAR);
          const have = d.your_coverage === 100;
          return (
            <div key={d.skill} className="absolute" style={{ left: x, top: y, transformStyle: "preserve-3d" }}>
              {/* glowing dot where the pillar meets the floor */}
              <span className={`absolute -left-2 -top-2 h-4 w-4 rounded-full ${have ? "bg-emerald-400" : "bg-brand-400"} shadow-[0_0_14px_4px_rgba(129,140,248,0.6)]`} />
              <div className="absolute bottom-0 left-0" style={{ transformStyle: "preserve-3d",
                transform: "rotateZ(calc(-1 * var(--rz))) rotateX(-90deg)", transformOrigin: "0 100%" }}>
                <div className="relative -translate-x-1/2" style={{ height: h }}>
                  <div ref={(node) => { pillars.current[i] = node; }}
                    className={`h-full w-3.5 origin-bottom rounded-t-full ${have
                    ? "bg-gradient-to-t from-emerald-500 via-emerald-400 to-teal-200 shadow-[0_0_18px_rgba(16,185,129,0.7)]"
                    : "bg-gradient-to-t from-brand-600 via-violet-400 to-fuchsia-300 shadow-[0_0_18px_rgba(129,140,248,0.75)]"}`}
                    style={{ transform: `scaleY(${grown ? 1 : 0})`, transition: `transform 1s cubic-bezier(0.22, 1, 0.36, 1) ${i * 80}ms` }}
                    title={`${d.skill}: asked for in ${d.jobs} jobs similar to yours${have ? " (you have it)" : ""}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Flat labels, positioned every frame above the pillar tops */}
      <div className="pointer-events-none absolute inset-0">
        {data.map((d, i) => (
          <span key={d.skill} ref={(node) => { labels.current[i] = node; }}
            className="absolute left-0 top-0 whitespace-nowrap rounded-md bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow ring-1 ring-white/10"
            style={{ opacity: grown ? 1 : 0, transition: `opacity 0.5s ease ${500 + i * 80}ms` }}>
            {d.skill} <span className={d.your_coverage === 100 ? "text-emerald-300" : "text-brand-200"}>{d.jobs}</span>
          </span>
        ))}
      </div>

      {/* Screen-reader version of the chart */}
      <ul className="sr-only">
        {data.map((d) => <li key={d.skill}>{d.skill}: asked for in {d.jobs} jobs similar to yours{d.your_coverage === 100 ? ", you have it" : ", missing"}</li>)}
      </ul>
    </div>
  );
}
