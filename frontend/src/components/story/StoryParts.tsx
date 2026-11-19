/*
 * Building blocks of the "How FitWork works" story: the stage, the 3D characters, and two small timers
 * (typing text, counting numbers) that stop when the story is paused.
 */
import { Building2, Crown, Laptop, ShieldCheck } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "./story.css";

export const STAGE_W = 960;
export const STAGE_H = 560;

/**
 * The scene clock: paused = the story is paused (timers wait), k = time stretch. With the narration on, a scene
 * lasts as long as its voice, so every delay in the scene is multiplied by k (also in CSS, via --k).
 */
export const StoryClock = createContext({ paused: false, k: 1 });

/** CSS variables for timeline animations: d = delay in seconds, plus optional from/to offsets in px. */
export function at(d: number, extra: { fx?: number; fy?: number; tx?: number; ty?: number } = {}): CSSProperties {
  const v: Record<string, string> = { "--d": `calc(var(--k, 1) * ${d}s)` };
  if (extra.fx !== undefined) v["--fx"] = `${extra.fx}px`;
  if (extra.fy !== undefined) v["--fy"] = `${extra.fy}px`;
  if (extra.tx !== undefined) v["--tx"] = `${extra.tx}px`;
  if (extra.ty !== undefined) v["--ty"] = `${extra.ty}px`;
  return v as CSSProperties;
}

/** The 960 x 560 scene, scaled down (never up past 1.25x) to the width it is given. */
export function Stage({ paused, k = 1, children }: { paused: boolean; k?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1.25, el.clientWidth / STAGE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="st-stage-outer bg-hero shadow-2xl ring-1 ring-white/10" style={{ height: STAGE_H * scale }}>
      <div className={`st-stage ${paused ? "st-paused" : ""}`} style={{ transform: `scale(${scale})`, "--k": k } as CSSProperties}>
        <div className="st-floor" />
        <StoryClock.Provider value={{ paused, k }}>{children}</StoryClock.Provider>
      </div>
    </div>
  );
}

type Look = { shirt: [string, string, string] };
/** Accent colours of the avatar badges (light, main, dark) */
export const LOOKS: Record<string, Look> = {
  sara: { shirt: ["#f9a8d4", "#db2777", "#500724"] },
  employer: { shirt: ["#cbd5e1", "#475569", "#0f172a"] },
  employer2: { shirt: ["#fcd34d", "#d97706", "#451a03"] },
  employer3: { shirt: ["#5eead4", "#0d9488", "#042f2e"] },
  employer4: { shirt: ["#c4b5fd", "#7c3aed", "#2e1065"] },
  owner: { shirt: ["#fde68a", "#d97706", "#451a03"] },
  ayesha: { shirt: ["#d8b4fe", "#9333ea", "#3b0764"] },
  bilal: { shirt: ["#99f6e4", "#0f766e", "#042f2e"] },
};

/**
 * A person as a professional 3D avatar badge: initial (or a building for a client, a crown for the owner),
 * glossy finish, a thin ring and a reflection. (x, y) is the bottom centre.
 */
export function Person({ x, y, look, size = 70, name, laptop, tie, crown, anim = "st-pop", d = 0, bob = 0, style }: {
  x: number; y: number; look: Look; size?: number; name?: string; laptop?: boolean; tie?: boolean; crown?: boolean;
  anim?: string; d?: number; bob?: number; style?: CSSProperties;
}) {
  const s = Math.round(size * 0.78);
  const vars = { "--s": `${s}px`, "--shirt-l": look.shirt[0], "--shirt": look.shirt[1], "--shirt-d": look.shirt[2], "--b": `${bob}s` } as CSSProperties;
  const initial = (name ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div className="absolute" style={{ left: x, top: y - 26 }}>
      <div className={anim} style={{ ...at(d), ...style }}>
        <div className="st-bob" style={vars}>
          <div className="st-person" style={vars}>
            <span className="st-avatar">{tie ? <Building2 /> : crown ? <Crown /> : initial}</span>
            {laptop && <span className="st-badge"><Laptop /></span>}
            {crown && <span className="st-badge"><ShieldCheck /></span>}
            {name && <span className="st-name">{name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Text that types itself out, starting after `delay` seconds (waits while paused). */
export function Typed({ text, delay = 0, speed = 28, className }: { text: string; delay?: number; speed?: number; className?: string }) {
  const { paused, k } = useContext(StoryClock);
  const [n, setN] = useState(0);
  const elapsed = useRef(0);
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - last;
      last = now;
      const chars = Math.floor(Math.max(0, elapsed.current - delay * k * 1000) / speed);
      setN(Math.min(text.length, chars));
      if (chars >= text.length) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [paused, k, text, delay, speed]);
  return <span className={className}>{text.slice(0, n)}{n < text.length && <span className="st-caret" />}</span>;
}

/** A number that counts up to `to` over `duration` seconds, after `delay` seconds (waits while paused). */
export function CountUp({ to, delay = 0, duration = 1.4 }: { to: number; delay?: number; duration?: number }) {
  const { paused, k } = useContext(StoryClock);
  const [v, setV] = useState(0);
  const elapsed = useRef(0);
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - last;
      last = now;
      const done = Math.min(1, Math.max(0, (elapsed.current / 1000 - delay * k) / duration));
      setV(Math.round(to * (1 - (1 - done) ** 3)));
      if (done >= 1) window.clearInterval(id);
    }, 40);
    return () => window.clearInterval(id);
  }, [paused, k, to, delay, duration]);
  return <>{v}</>;
}

/** Score ring (SVG) that fills to `score` after `delay`. */
export function Ring({ score, delay = 0, size = 92 }: { score: number; delay?: number; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const colour = score >= 75 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f3e8ff" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={colour} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c} style={{ animation: `st-ring-fill-${score} 1.4s cubic-bezier(0.2,0.8,0.2,1) calc(var(--k, 1) * ${delay}s) forwards` }} />
        <style>{`@keyframes st-ring-fill-${score} { to { stroke-dashoffset: ${c * (1 - score / 100)}; } }`}</style>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-display text-2xl font-extrabold text-slate-900">
        <CountUp to={score} delay={delay} />
      </div>
    </div>
  );
}
