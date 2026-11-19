/**
 * 3D "skill skyline" for the Skill Gap page.
 *
 * Every top skill in the user's field is a 3D tower standing on a floor with two zones:
 *   left  = skills you HAVE (green), right = skills you're MISSING (violet).
 * Tower height = how many jobs similar to yours ask for that skill. Towers stand in a row (sorted,
 * tallest first) so they never overlap. Each tower carries a number that matches the list below the
 * chart; hovering a tower highlights its row and the other way round.
 *
 * Motion: the floor turns with the mouse (and sways gently when idle). Rotation is written to CSS
 * variables on animation frames, so React does not re-render while it moves.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export interface RadarPoint {
  skill: string;
  market_demand: number; // 0-100 (the most requested skill = 100)
  jobs: number;
  your_coverage: number; // 100 = the user has this skill
  example_job?: string | null; // a real job in the user's field that asks for it
}

const W = 30;          // tower width and depth (px)
const STEP = 54;       // distance between towers
const GAP = 46;        // gap between the two zones
const MAX_H = 150;     // tower height for the most requested skill
const DEPTH = 120;     // floor depth
const PAD = 26;        // floor padding

const HAVE = { top: "#6ee7b7", front: "linear-gradient(to bottom, #10b981, #047857)", side: "linear-gradient(to bottom, #059669, #064e3b)", glow: "rgba(16,185,129,0.65)" };
const MISS = { top: "#c4b5fd", front: "linear-gradient(to bottom, #8b5cf6, #4338ca)", side: "linear-gradient(to bottom, #6d28d9, #312e81)", glow: "rgba(139,92,246,0.7)" };

function Tower({ h, x, y, have, active }: { h: number; x: number; y: number; have: boolean; active: boolean }) {
  const c = have ? HAVE : MISS;
  const face = { position: "absolute" as const, backfaceVisibility: "visible" as const, transition: "all 0.9s cubic-bezier(0.22, 1, 0.36, 1)" };
  return (
    <div style={{ position: "absolute", left: x, top: y, width: W, height: W, transformStyle: "preserve-3d", pointerEvents: "auto" }}>
      {/* glow on the floor */}
      <div style={{ ...face, inset: -10, borderRadius: 12, background: c.glow, filter: "blur(10px)", opacity: active ? 0.9 : 0.45 }} />
      {/* front, back, left, right and top faces */}
      <div style={{ ...face, left: 0, top: W, width: W, height: h, background: c.front, transformOrigin: "top", transform: "rotateX(90deg)" }} />
      <div style={{ ...face, left: 0, top: 0, width: W, height: h, background: c.front, transformOrigin: "top", transform: "rotateX(90deg)" }} />
      <div style={{ ...face, left: 0, top: 0, width: h, height: W, background: c.side, transformOrigin: "left", transform: "rotateY(-90deg)" }} />
      <div style={{ ...face, left: W, top: 0, width: h, height: W, background: c.side, transformOrigin: "left", transform: "rotateY(-90deg)" }} />
      <div style={{ ...face, left: 0, top: 0, width: W, height: W, background: c.top, transform: `translateZ(${h}px)`,
        boxShadow: active ? `0 0 24px 6px ${c.glow}` : "none" }} />
    </div>
  );
}

export function Radar3D({ data, instant = false }: { data: RadarPoint[]; instant?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const tops = useRef<(HTMLDivElement | null)[]>([]);
  const badges = useRef<(HTMLSpanElement | null)[]>([]);
  const [grown, setGrown] = useState(instant);
  const [hover, setHover] = useState<number | null>(null);

  // Have first, then missing; tallest first in each zone. Numbers follow this order.
  const items = useMemo(() => {
    const have = data.filter((d) => d.your_coverage === 100).sort((a, b) => b.jobs - a.jobs);
    const miss = data.filter((d) => d.your_coverage !== 100).sort((a, b) => b.jobs - a.jobs);
    return { have, miss, all: [...have, ...miss] };
  }, [data]);
  const maxJobs = Math.max(1, ...data.map((d) => d.jobs));
  const haveW = items.have.length ? items.have.length * STEP - (STEP - W) : 0;
  const missW = items.miss.length ? items.miss.length * STEP - (STEP - W) : 0;
  const floorW = PAD * 2 + haveW + missW + (haveW && missW ? GAP : 0);
  const towerX = (i: number) => PAD + i * STEP + (i >= items.have.length && items.have.length ? GAP - (STEP - W) : 0);
  const towerY = (DEPTH - W) / 2 - 8;

  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Turn with the mouse; number badges follow the tower tops on screen.
  // The animation loop only runs while something moves (towers growing, the mouse turning the chart, a resize)
  // and stops once the chart has settled. Before 19 Nov 2026 it ran forever with an idle sway and measured every
  // tower 60 times a second, which kept the Skill Gap page at ~29 fps.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let rz = -28, rx = 58, tz = -28, tx = 58, frame = 0, running = false;
    let busyUntil = performance.now() + (instant ? 300 : 2500);  // towers grow in for ~2 s (not on a return visit)
    const tick = (now: number) => {
      rz += (tz - rz) * 0.1;
      rx += (tx - rx) * 0.1;
      el.style.setProperty("--rz", `${rz.toFixed(2)}deg`);
      el.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      const box = el.getBoundingClientRect();
      tops.current.forEach((top, i) => {
        const badge = badges.current[i];
        if (!top || !badge) return;
        const r = top.getBoundingClientRect();
        badge.style.transform = `translate(${(r.left + r.width / 2 - box.left).toFixed(1)}px, ${(r.top - box.top - 4).toFixed(1)}px) translate(-50%, -100%)`;
      });
      const settled = Math.abs(tz - rz) < 0.05 && Math.abs(tx - rx) < 0.05 && now > busyUntil;
      if (settled) { running = false; return; }
      frame = requestAnimationFrame(tick);
    };
    const kick = (forMs = 0) => {
      busyUntil = Math.max(busyUntil, performance.now() + forMs);
      if (!running) { running = true; frame = requestAnimationFrame(tick); }
    };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      tz = -55 + x * 55;   // mouse at the left edge: -55 deg, right edge: 0 deg
      tx = 48 + y * 20;    // top: flatter view, bottom: steeper view
      kick();
    };
    const onLeave = () => { tz = -28; tx = 58; kick(); };
    // Fit the floor to the available width (phones are much narrower than the chart)
    const fit = () => { el.style.setProperty("--fit", String(Math.min(1, (el.clientWidth - 16) / (floorW * 1.12)))); kick(600); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    kick();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [floorW]);

  return (
    <div>
      <div ref={stage} className="relative h-[300px] w-full cursor-ew-resize touch-pan-y select-none overflow-hidden sm:h-[340px]"
        style={{ perspective: "1000px", ["--rz" as string]: "-28deg", ["--rx" as string]: "58deg" }}>
        <div className="absolute left-1/2 top-[62%]" style={{ width: floorW, height: DEPTH, marginLeft: -floorW / 2, marginTop: -DEPTH / 2,
          transformStyle: "preserve-3d", transform: "scale(var(--fit, 1)) rotateX(var(--rx)) rotateZ(var(--rz))", willChange: "transform" }}>
          {/* Floor zones with their names painted on the floor */}
          {items.have.length > 0 && (
            <div className="absolute rounded-2xl border border-emerald-400/50 bg-emerald-400/10" style={{ left: PAD - 14, top: 0, width: haveW + 28, height: DEPTH }}>
              <span className="absolute bottom-2 left-3 text-[11px] font-extrabold tracking-widest text-emerald-300">✓ YOU HAVE</span>
            </div>
          )}
          {items.miss.length > 0 && (
            <div className="absolute rounded-2xl border border-violet-400/50 bg-violet-500/10"
              style={{ left: towerX(items.have.length) - 14, top: 0, width: missW + 28, height: DEPTH }}>
              <span className="absolute bottom-2 left-3 text-[11px] font-extrabold tracking-widest text-violet-300">✗ YOU'RE MISSING</span>
            </div>
          )}
          {items.all.map((d, i) => {
            const h = grown ? Math.max(10, (d.jobs / maxJobs) * MAX_H) : 2;
            return (
              <div key={d.skill} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", pointerEvents: "none" }}>
                <Tower h={h} x={towerX(i)} y={towerY} have={d.your_coverage === 100} active={hover === i} />
                {/* invisible marker on the tower top, used to place the flat number badge */}
                <div ref={(node) => { tops.current[i] = node; }} style={{ position: "absolute", left: towerX(i), top: towerY, width: W, height: W,
                  transform: `translateZ(${h}px)`, transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)" }} />
              </div>
            );
          })}
        </div>

        {/* Number badges: flat, always readable, follow the tower tops */}
        <div className="pointer-events-none absolute inset-0">
          {items.all.map((d, i) => (
            <span key={d.skill} ref={(node) => { badges.current[i] = node; }}
              className={`absolute left-0 top-0 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white shadow-lg ring-2 ${
                d.your_coverage === 100 ? "bg-emerald-500 ring-emerald-200/60" : "bg-violet-600 ring-violet-200/60"}`}
              style={{ opacity: grown ? 1 : 0, transition: "opacity 0.6s ease 0.6s" }}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* The key: what each number means */}
      <div className="grid grid-cols-1 gap-4 px-4 pb-2 sm:grid-cols-2">
        {[{ title: "✓ You have", list: items.have, offset: 0, have: true },
          { title: "✗ You're missing", list: items.miss, offset: items.have.length, have: false }].map((group) => (
          <div key={group.title} className="min-w-0">
            <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${group.have ? "text-emerald-300" : "text-violet-300"}`}>{group.title}</p>
            {group.list.length === 0 ? (
              <p className="text-xs text-slate-400">{group.have ? "None of the top skills in your field yet." : "Nothing: you have every top skill in your field."}</p>
            ) : (
              <ul className="space-y-1">
                {group.list.map((d, j) => {
                  const i = group.offset + j;
                  return (
                    <li key={d.skill} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                      className={`min-w-0 rounded-lg px-2 py-1.5 text-sm transition ${hover === i ? "bg-white/15" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className={`flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${group.have ? "bg-emerald-500" : "bg-violet-600"}`}>{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-white">{d.skill}</span>
                        <span className="shrink-0 text-xs text-slate-300">{d.jobs} jobs</span>
                      </div>
                      {d.example_job && (
                        <p className="mt-0.5 truncate pl-7 text-[11px] text-slate-400" title={d.example_job}>e.g. “{d.example_job}”</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
