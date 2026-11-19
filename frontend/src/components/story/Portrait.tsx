/*
 * Realistic portraits for the story's people (Sara, Ayesha, Bilal, the agency owner and the client).
 * Drawn in SVG with layered soft shading (cheekbones, eye sockets, nose, jaw), detailed eyes (eyelid crease,
 * lashes, iris ring, catchlights), shaped lips, and expressions that move like a real face:
 *  - smiles lift the cheeks and the lower eyelids and show the teeth,
 *  - worry raises the inner eyebrows and shows forehead lines,
 *  - confusion raises one eyebrow and pulls the mouth to one side.
 * The face parts are generated from numbers, and every path keeps the same shape commands, so the browser can
 * morph smoothly from one expression to the next (CSS transition on "d").
 * moods: [mood, second][] - which expression to show from which second of the scene.
 */
import { type CSSProperties, useContext, useEffect, useId, useRef, useState } from "react";

import { StoryClock } from "./StoryParts";

export type Mood = "neutral" | "confused" | "stressed" | "curious" | "hopeful" | "focused" | "happy" | "proud";
export type Who = "sara" | "ayesha" | "bilal" | "owner" | "client";

// ---------------------------------------------------------------- expressions
type Brow = [number, number, number];          // y of inner end, peak, outer end
type Expr = {
  browL: Brow; browR: Brow;
  open: number;            // upper eyelid opening (1 = normal)
  squint: number;          // lower eyelid raised by a smile (0..1)
  look: [number, number];  // gaze
  mouth: { w: number; cl: number; cr: number; mid: number; open: number; up: number };
  teeth: number; cheeks: number; worry: number; tilt: number;
};
const E = (browL: Brow, browR: Brow, open: number, squint: number, look: [number, number], mouth: Expr["mouth"],
  teeth: number, cheeks: number, worry: number, tilt: number): Expr => ({ browL, browR, open, squint, look, mouth, teeth, cheeks, worry, tilt });

const EXPR: Record<Mood, Expr> = {
  neutral:  E([90, 87.5, 90], [90, 87.5, 90], 1, 0, [0, 0], { w: 10, cl: 0.4, cr: 0.4, mid: 0.3, open: 0, up: 0 }, 0, 0, 0, 0),
  focused:  E([91, 89.5, 90.5], [91, 89.5, 90.5], 0.9, 0.1, [1.6, 1.8], { w: 9.5, cl: 0.6, cr: 0.6, mid: 0, open: 0, up: 0 }, 0, 0, 0, -2),
  confused: E([88, 83.5, 87.5], [92, 90.5, 92], 1.05, 0, [2.4, -1.6], { w: 9.5, cl: 1.4, cr: -0.8, mid: -0.2, open: 0, up: 0.3 }, 0, 0, 0.25, 6),
  stressed: E([87.5, 87, 91.5], [87.5, 87, 91.5], 0.86, 0.05, [-1.4, 1.2], { w: 9.2, cl: 1.8, cr: 1.8, mid: -0.7, open: 0, up: 0.2 }, 0, 0, 1, -3),
  curious:  E([87.5, 84.5, 87.5], [87.5, 84.5, 87.5], 1.12, 0, [1.6, -1], { w: 8, cl: 0.4, cr: 0.4, mid: 0.2, open: 2, up: 0.4 }, 0.2, 0, 0.2, 3),
  hopeful:  E([88.5, 85.5, 88.5], [88.5, 85.5, 88.5], 1.04, 0.3, [0.6, -0.8], { w: 11, cl: -1.5, cr: -1.5, mid: 0.9, open: 1, up: 0.2 }, 0.4, 0.45, 0, 2),
  happy:    E([89, 86, 88.5], [89, 86, 88.5], 0.92, 0.85, [0, 0], { w: 12.5, cl: -3.2, cr: -3.2, mid: 1.6, open: 4.2, up: 0.5 }, 1, 1, 0, 3),
  proud:    E([89.5, 87, 89.5], [89.5, 87, 89.5], 0.95, 0.5, [0, -0.8], { w: 11.5, cl: -1.8, cr: -2.8, mid: 0.9, open: 1.6, up: 0.3 }, 0.7, 0.7, 0, -4),
};

// ---------------------------------------------------------------- people
type Person = {
  female: boolean; skin: [string, string, string]; lips: string; iris: string;
  hair: "long" | "hijab" | "short" | "neat"; hairColor: [string, string]; beard?: boolean; glasses?: boolean;
  outfit: "blazer" | "kurta" | "shirt" | "suit"; cloth: [string, string]; inner: string; tie?: string; earring?: boolean;
  brow: string;
};
const PEOPLE: Record<Who, Person> = {
  sara:   { female: true,  skin: ["#f7d6bf", "#e3ae8c", "#c48663"], lips: "#b55463", iris: "#5a3418", hair: "long",  hairColor: ["#3d2617", "#140a05"], outfit: "blazer", cloth: ["#7a2d86", "#3a1046"], inner: "#f5edf2", earring: true, brow: "#24140b" },
  ayesha: { female: true,  skin: ["#f3cfb4", "#dca37f", "#bb7c58"], lips: "#a8505a", iris: "#3b2414", hair: "hijab", hairColor: ["#a8788f", "#6d4560"], outfit: "kurta", cloth: ["#9b7fd0", "#5b3f96"], inner: "#e9e1f7", brow: "#2a180d" },
  bilal:  { female: false, skin: ["#e6b893", "#c98f68", "#a26b49"], lips: "#a0645a", iris: "#2f1c0f", hair: "short", hairColor: ["#26190f", "#0b0603"], beard: true, outfit: "shirt", cloth: ["#2aa198", "#0f5f5a"], inner: "#0f5f5a", brow: "#120a05" },
  owner:  { female: false, skin: ["#f0c8a8", "#d49c78", "#b07452"], lips: "#a3655c", iris: "#3a2513", hair: "short", hairColor: ["#2e2a28", "#121010"], glasses: true, outfit: "blazer", cloth: ["#33415c", "#141c2e"], inner: "#f1f3f7", brow: "#1a1716" },
  client: { female: false, skin: ["#f2cdb2", "#d8a383", "#b57c5c"], lips: "#a4675e", iris: "#3e4b5a", hair: "neat",  hairColor: ["#8d8a86", "#4b4846"], outfit: "suit", cloth: ["#4a4f5a", "#1f232b"], inner: "#f4f6f9", tie: "#8f1d3f", brow: "#5d5955" },
};

// people blink at different moments, like real people
const BLINK_DELAY: Record<Who, number> = { sara: 0, ayesha: 1.7, bilal: 3.1, owner: 2.3, client: 4.2 };

// ---------------------------------------------------------------- shape generators (same commands every time)
const f = (n: number) => n.toFixed(2);
function browPath(side: -1 | 1, [iy, py, oy]: Brow, female: boolean): string {
  const xi = 100 + side * 7.5, xp = 100 + side * 20, xo = 100 + side * 29;
  const t = female ? 1 : 1.35;
  const top = [xi, iy - 1.9 * t], bot = [xi, iy + 1.7 * t];
  const cTop = [2 * xp - (xi + xo) / 2, 2 * (py - 1.5 * t) - (top[1] + oy) / 2];
  const cBot = [2 * xp - (xi + xo) / 2, 2 * (py + 1.1 * t) - (oy + 0.4 + bot[1]) / 2];
  return `M${f(top[0])} ${f(top[1])} Q${f(cTop[0])} ${f(cTop[1])} ${f(xo)} ${f(oy)} Q${f(cBot[0])} ${f(cBot[1])} ${f(bot[0])} ${f(bot[1])} Z`;
}
function eyeShape(cx: number, side: -1 | 1, open: number, squint: number): string {
  const cy = 104, xi = cx - side * 7.6, xo = cx + side * 8.2, yo = cy - 0.9;
  const top = cy - 6.6 * open, bot = cy + 4.8 - squint * 2.6;
  return `M${f(xi)} ${cy} Q${f(cx - side * 0.5)} ${f(top)} ${f(xo)} ${f(yo)} Q${f(cx)} ${f(bot)} ${f(xi)} ${cy} Z`;
}
function lashPath(cx: number, side: -1 | 1, open: number, female: boolean): string {
  const cy = 104, xi = cx - side * 7.9, xo = cx + side * 8.6, yo = cy - 1.1;
  const top = cy - 7.1 * open, th = female ? 1.9 : 1.2;
  const wing = female ? [xo + side * 1.8, yo - 1.6] : [xo + side * 0.4, yo - 0.2];
  return `M${f(xi)} ${f(cy - 0.2)} Q${f(cx - side * 0.5)} ${f(top - th)} ${f(wing[0])} ${f(wing[1])} Q${f(cx)} ${f(top + 0.6)} ${f(xi)} ${f(cy + 0.4)} Z`;
}
function creasePath(cx: number, side: -1 | 1, open: number): string {
  const cy = 104;
  return `M${f(cx - side * 7)} ${f(cy - 4)} Q${f(cx)} ${f(cy - 9.6 * Math.max(0.85, open))} ${f(cx + side * 8.6)} ${f(cy - 3.2)}`;
}
function lips(m: Expr["mouth"]) {
  const y = 131.5, L = [100 - m.w, y + m.cl], R = [100 + m.w, y + m.cr];
  const line = y + m.mid, top = y - 3.6 - m.up, bottom = y + 4.4 + m.open * 0.75;
  const upper = `M${f(L[0])} ${f(L[1])} C${f(L[0] + 4)} ${f(top + 1.4)} ${f(96.5)} ${f(top - 0.2)} ${f(97.6)} ${f(top)} Q${f(100)} ${f(top + 1.3)} ${f(102.4)} ${f(top)} C${f(103.5)} ${f(top - 0.2)} ${f(R[0] - 4)} ${f(top + 1.4)} ${f(R[0])} ${f(R[1])} Q${f(100)} ${f(line + 0.6)} ${f(L[0])} ${f(L[1])} Z`;
  const lower = `M${f(L[0])} ${f(L[1])} Q${f(100)} ${f(line + m.open)} ${f(R[0])} ${f(R[1])} Q${f(100)} ${f(bottom + 2.2)} ${f(L[0])} ${f(L[1])} Z`;
  const gap = `M${f(L[0])} ${f(L[1])} Q${f(100)} ${f(line)} ${f(R[0])} ${f(R[1])} Q${f(100)} ${f(line + m.open)} ${f(L[0])} ${f(L[1])} Z`;
  const teeth = `M${f(L[0] + 2)} ${f(L[1] + 0.2)} Q${f(100)} ${f(line)} ${f(R[0] - 2)} ${f(R[1] + 0.2)} Q${f(100)} ${f(line + m.open * 0.62)} ${f(L[0] + 2)} ${f(L[1] + 0.2)} Z`;
  const seam = `M${f(L[0])} ${f(L[1])} Q${f(100)} ${f(line + m.open * 0.5)} ${f(R[0])} ${f(R[1])}`;
  return { upper, lower, gap, teeth, seam };
}

/** Which expression is showing, following the scene clock (waits while paused, stretched with the narration). */
function useMood(moods: [Mood, number][]): Mood {
  const { paused, k } = useContext(StoryClock);
  const [mood, setMood] = useState<Mood>(moods[0][0]);
  const elapsed = useRef(0);
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      elapsed.current += now - last;
      last = now;
      let current = moods[0][0];
      for (const [m, at] of moods) if (elapsed.current / 1000 >= at * k) current = m;
      setMood(current);
    }, 120);
    return () => window.clearInterval(id);
  }, [paused, k, moods]);
  return mood;
}

export function Portrait({ who, moods, size = 240, laptop = false }: { who: Who; moods: [Mood, number][]; size?: number; laptop?: boolean }) {
  const p = PEOPLE[who];
  const e = EXPR[useMood(moods)];
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const T = "0.55s cubic-bezier(0.3, 0.7, 0.3, 1)";
  /** a face path that morphs: the CSS d property is animated; the attribute is the fallback */
  const mp = (d: string, extra: CSSProperties = {}) => ({ d, style: { d: `path("${d}")`, transition: `d ${T}, opacity ${T}`, ...extra } as CSSProperties });
  const fade = (v: number) => ({ opacity: v, transition: `opacity ${T}` });
  const L = lips(e.mouth);

  const eye = (cx: number, side: -1 | 1) => (
    <g key={cx}>
      {/* soft shadow of the eye socket and lid */}
      <ellipse cx={cx} cy={99} rx={11} ry={6.5} fill={url("socket")} />
      <g className="pt-blink" style={{ transformOrigin: `${cx}px 104px`, animationDelay: `${BLINK_DELAY[who]}s` }}>
        <clipPath id={id(`eye${cx}`)}><path {...mp(eyeShape(cx, side, e.open, e.squint))} /></clipPath>
        <path {...mp(eyeShape(cx, side, e.open, e.squint))} fill={url("sclera")} />
        <g clipPath={url(`eye${cx}`)}>
          <g style={{ transform: `translate(${e.look[0]}px, ${e.look[1]}px)`, transition: `transform ${T}` }}>
            <circle cx={cx} cy={104} r={4.3} fill={url("iris")} />
            <circle cx={cx} cy={104} r={4.3} fill="none" stroke="#120a05" strokeWidth={0.7} opacity={0.75} />
            <circle cx={cx} cy={104} r={1.85} fill="#0a0503" />
            <circle cx={cx - 1.4} cy={102.5} r={1.05} fill="#fff" opacity={0.95} />
            <circle cx={cx + 1.5} cy={105.4} r={0.45} fill="#fff" opacity={0.7} />
          </g>
          {/* shadow the upper lid casts on the eyeball */}
          <path {...mp(eyeShape(cx, side, e.open, e.squint))} fill="none" stroke="#5b3a2a" strokeWidth={2.4} opacity={0.18} />
        </g>
        <path {...mp(lashPath(cx, side, e.open, p.female))} fill="#1a0f09" />
        <path {...mp(creasePath(cx, side, e.open))} fill="none" stroke={p.skin[2]} strokeWidth={0.9} opacity={0.7} strokeLinecap="round" />
        {/* lower lid line */}
        <path {...mp(`M${cx - side * 7} 105.6 Q${cx} ${f(109.6 - e.squint * 2.6)} ${cx + side * 7.6} 104.6`)} fill="none" stroke={p.skin[2]} strokeWidth={0.7} opacity={0.55} />
      </g>
    </g>
  );

  return (
    <svg viewBox="0 0 200 240" width={size} height={size * 1.2} className="pt-portrait overflow-visible" role="img" aria-label={who}
      style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 84%, transparent)", maskImage: "linear-gradient(to bottom, #000 84%, transparent)" }}>
      <defs>
        <radialGradient id={id("skin")} cx="0.43" cy="0.38" r="0.68">
          <stop offset="0" stopColor={p.skin[0]} /><stop offset="0.62" stopColor={p.skin[1]} /><stop offset="1" stopColor={p.skin[2]} />
        </radialGradient>
        <linearGradient id={id("neck")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.skin[2]} /><stop offset="0.45" stopColor={p.skin[1]} /></linearGradient>
        <radialGradient id={id("shade")}><stop offset="0" stopColor="#6b3420" stopOpacity="0.32" /><stop offset="1" stopColor="#6b3420" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("light")}><stop offset="0" stopColor="#fff" stopOpacity="0.38" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("blush")}><stop offset="0" stopColor="#e2786a" stopOpacity="0.32" /><stop offset="1" stopColor="#e2786a" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("socket")}><stop offset="0" stopColor="#6e3b2c" stopOpacity="0.22" /><stop offset="1" stopColor="#6e3b2c" stopOpacity="0" /></radialGradient>
        <radialGradient id={id("sclera")} cx="0.5" cy="0.45" r="0.6"><stop offset="0" stopColor="#fdfbf8" /><stop offset="1" stopColor="#d9cdc6" /></radialGradient>
        <radialGradient id={id("iris")} cx="0.45" cy="0.4" r="0.6"><stop offset="0" stopColor="#b9875a" /><stop offset="0.45" stopColor={p.iris} /><stop offset="1" stopColor="#120a05" /></radialGradient>
        <linearGradient id={id("hair")} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={p.hairColor[0]} /><stop offset="1" stopColor={p.hairColor[1]} /></linearGradient>
        <linearGradient id={id("cloth")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.cloth[0]} /><stop offset="1" stopColor={p.cloth[1]} /></linearGradient>
        <linearGradient id={id("lip")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.lips} /><stop offset="1" stopColor="#6e2a33" /></linearGradient>
        <radialGradient id={id("beard")} cx="0.5" cy="0.6" r="0.6"><stop offset="0" stopColor="#1c120b" stopOpacity="0.55" /><stop offset="1" stopColor="#1c120b" stopOpacity="0.12" /></radialGradient>
        <linearGradient id={id("laptop")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a4d5e" /><stop offset="1" stopColor="#23242e" /></linearGradient>
      </defs>

      <g>
        {/* ------------ behind the head ------------ */}
        {p.hair === "long" && <path d="M57 90 C50 140 47 194 60 222 L140 222 C153 194 150 140 143 90 C136 58 64 58 57 90 Z" fill={url("hair")} />}
        {p.hair === "hijab" && <path d="M52 96 C46 150 44 200 40 240 L160 240 C156 200 154 150 148 96 C144 48 56 48 52 96 Z" fill={url("hair")} />}

        {/* ------------ body (raised so the neck has natural length) ------------ */}
        <g transform="translate(0 -12)">
        <path d="M14 240 C16 204 38 188 72 180 L100 194 L128 180 C162 188 184 204 186 240 Z" fill={url("cloth")} />
        {p.outfit === "blazer" || p.outfit === "suit" ? (
          <>
            <path d="M84 178 L100 214 L116 178 Z" fill={p.inner} />
            {p.tie && <path d="M97.4 188 L102.6 188 L104.5 214 L100 222 L95.5 214 Z" fill={p.tie} />}
            <path d="M72 180 L100 216 L86 240 L60 240 C62 212 65 194 72 180 Z" fill="#fff" opacity="0.1" />
            <path d="M128 180 L100 216 L114 240 L140 240 C138 212 135 194 128 180 Z" fill="#000" opacity="0.14" />
          </>
        ) : p.outfit === "shirt" ? (
          <>
            <path d="M84 178 L100 196 L116 178 L112 176 L100 190 L88 176 Z" fill="#fff" opacity="0.22" />
            <path d="M100 196 L100 240" stroke="#000" strokeOpacity="0.18" strokeWidth="1" />
          </>
        ) : (
          <path d="M86 180 Q100 196 114 180 L112 178 Q100 190 88 178 Z" fill="#fff" opacity="0.25" />
        )}
        <path d="M30 230 C46 214 60 206 74 202" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
        <path d="M170 230 C154 214 140 206 126 202" fill="none" stroke="#000" strokeOpacity="0.12" strokeWidth="2" />
        <path d="M14 240 L186 240 L186 252 L14 252 Z" fill={url("cloth")} />
        </g>

        {/* ------------ neck ------------ */}
        {p.hair !== "hijab" && (
          <>
            <path d={p.female ? "M86.5 138 L86.5 170 Q100 180 113.5 170 L113.5 138 Z" : "M83.5 138 L83.5 171 Q100 181 116.5 171 L116.5 138 Z"} fill={url("neck")} />
            <ellipse cx="100" cy="150" rx="16" ry="9" fill={url("shade")} />
          </>
        )}

        {/* ------------ head (tilts) ------------ */}
        <g style={{ transform: `rotate(${e.tilt}deg)`, transformOrigin: "100px 150px", transition: `transform ${T}` }}>
          {p.hair !== "hijab" && (
            <>
              <ellipse cx="61" cy="106" rx="4.6" ry="8.4" fill={p.skin[1]} /><ellipse cx="139" cy="106" rx="4.6" ry="8.4" fill={p.skin[1]} />
              <ellipse cx="61.6" cy="106" rx="2" ry="5" fill={p.skin[2]} opacity="0.6" /><ellipse cx="138.4" cy="106" rx="2" ry="5" fill={p.skin[2]} opacity="0.6" />
              {p.earring && <><circle cx="61" cy="115.5" r="1.6" fill="#f5d27a" /><circle cx="139" cy="115.5" r="1.6" fill="#f5d27a" /></>}
            </>
          )}
          <path d={p.female
            ? "M100 52 C127 52 139 72 138.5 98 C138 122 126 143 108 151 C104 153 96 153 92 151 C74 143 62 122 61.5 98 C61 72 73 52 100 52 Z"
            : "M100 51 C129 51 141 72 140.5 99 C140 124 129 144 110 152 C105 154 95 154 90 152 C71 144 60 124 59.5 99 C59 72 71 51 100 51 Z"}
            fill={url("skin")} />

          {/* light and shadow that give the face its shape */}
          <ellipse cx="96" cy="72" rx="20" ry="11" fill={url("light")} />
          <ellipse cx="66" cy="96" rx="8" ry="18" fill={url("shade")} /><ellipse cx="134" cy="96" rx="8" ry="18" fill={url("shade")} />
          <ellipse cx="76" cy="127" rx="10" ry="12" fill={url("shade")} opacity="0.7" /><ellipse cx="124" cy="127" rx="10" ry="12" fill={url("shade")} opacity="0.7" />
          <ellipse cx="80" cy="116" rx="9.5" ry="6" fill={url("light")} style={{ transform: `translateY(${-e.cheeks * 2.2}px)`, transition: `transform ${T}` }} />
          <ellipse cx="120" cy="116" rx="9.5" ry="6" fill={url("light")} style={{ transform: `translateY(${-e.cheeks * 2.2}px)`, transition: `transform ${T}` }} />
          {p.female && <><ellipse cx="80" cy="120" rx="9" ry="5.5" fill={url("blush")} /><ellipse cx="120" cy="120" rx="9" ry="5.5" fill={url("blush")} /></>}
          <ellipse cx="100" cy="146" rx="9" ry="4" fill={url("light")} />
          {/* nose */}
          <ellipse cx="100" cy="108" rx="2.2" ry="10" fill={url("light")} />
          <ellipse cx="95.6" cy="112" rx="3" ry="9" fill={url("shade")} opacity="0.85" />
          <ellipse cx="100" cy="118.6" rx="4.8" ry="3.3" fill={url("light")} />
          <path d="M94.6 119.8 Q93.4 122.6 96.6 122.9" fill="none" stroke={p.skin[2]} strokeWidth="1" strokeLinecap="round" />
          <path d="M105.4 119.8 Q106.6 122.6 103.4 122.9" fill="none" stroke={p.skin[2]} strokeWidth="1" strokeLinecap="round" />
          <ellipse cx="97.4" cy="122.3" rx="1.6" ry="0.8" fill="#4a2318" opacity="0.5" /><ellipse cx="102.6" cy="122.3" rx="1.6" ry="0.8" fill="#4a2318" opacity="0.5" />
          <ellipse cx="100" cy="126" rx="2" ry="1.6" fill={url("shade")} />
          {/* smile lines and worry lines appear with the expression */}
          <path d="M88 122 Q85 128 88.5 134" fill="none" stroke={p.skin[2]} strokeWidth="1" strokeLinecap="round" style={fade(e.cheeks * 0.7)} />
          <path d="M112 122 Q115 128 111.5 134" fill="none" stroke={p.skin[2]} strokeWidth="1" strokeLinecap="round" style={fade(e.cheeks * 0.7)} />
          <path d="M88 76 Q100 73 112 76 M90 80 Q100 77.5 110 80" fill="none" stroke={p.skin[2]} strokeWidth="0.8" strokeLinecap="round" style={fade(e.worry * 0.6)} />
          <path d="M97.5 90 L98.5 95 M102.5 90 L101.5 95" fill="none" stroke={p.skin[2]} strokeWidth="0.8" strokeLinecap="round" style={fade(e.worry * 0.7)} />

          {/* beard and moustache */}
          {p.beard && (
            <>
              <path d="M64 112 C66 132 80 150 100 153 C120 150 134 132 136 112 C130 128 120 140 110 141 Q100 136 90 141 C80 140 70 128 64 112 Z" fill={url("beard")} />
              <path d="M88 127.5 Q100 123 112 127.5 Q100 126 88 127.5 Z" fill="#1c120b" opacity="0.45" />
            </>
          )}

          {eye(83, -1)}
          {eye(117, 1)}
          <path {...mp(browPath(-1, e.browL, p.female))} fill={p.brow} opacity="0.92" />
          <path {...mp(browPath(1, e.browR, p.female))} fill={p.brow} opacity="0.92" />
          {p.glasses && (
            <g fill="none" stroke="#1d1f26" strokeWidth="1.8">
              <rect x="71" y="96" width="24" height="16" rx="5" /><rect x="105" y="96" width="24" height="16" rx="5" />
              <path d="M95 103 Q100 100.5 105 103 M71 101 L61 99 M129 101 L139 99" />
              <rect x="71" y="96" width="24" height="16" rx="5" fill="#fff" fillOpacity="0.06" stroke="none" />
            </g>
          )}

          {/* mouth */}
          <path {...mp(L.gap)} fill="#3a0f14" />
          <path {...mp(L.teeth, { opacity: e.teeth })} fill="#f7f3ee" />
          <path {...mp(L.lower)} fill={url("lip")} />
          <path {...mp(L.upper)} fill={p.lips} />
          <path {...mp(L.seam)} fill="none" stroke="#4a1a20" strokeWidth="0.8" opacity="0.7" />
          <ellipse cx="100" cy="136.4" rx="4.5" ry="1.2" fill="#fff" opacity="0.28" style={{ transform: `translateY(${e.mouth.open * 0.7}px)`, transition: `transform ${T}` }} />
          <ellipse cx="100" cy="140.5" rx="6" ry="2.2" fill={url("shade")} style={{ transform: `translateY(${e.mouth.open * 0.7}px)`, transition: `transform ${T}` }} />

          {/* ------------ hair / hijab in front ------------ */}
          {p.hair === "long" && (
            <>
              <path d="M58 108 C52 72 72 46 102 46 C130 46 148 66 143 106 C140 86 132 70 116 63 C108 76 90 86 70 89 C64 94 60 100 58 108 Z" fill={url("hair")} />
              <path d="M70 89 C62 104 60 124 63 146 C58 128 56 108 58 96 Z" fill={url("hair")} />
              <path d="M141 92 C144 112 143 130 138 146 C146 126 148 106 145 92 Z" fill={url("hair")} />
              <path d="M118 54 C130 60 138 74 140 92 M126 52 C136 60 143 74 144 88 M66 100 C64 116 64 130 66 142" fill="none" stroke="#6b4a33" strokeWidth="1.1" opacity="0.5" strokeLinecap="round" />
              <path d="M84 56 C96 50 112 50 124 56" fill="none" stroke="#fff" strokeWidth="2.4" opacity="0.12" strokeLinecap="round" />
            </>
          )}
          {p.hair === "hijab" && (
            <>
              <path d="M100 42 C132 42 150 66 148 100 C147 130 136 156 118 170 C110 176 90 176 82 170 C64 156 53 130 52 100 C50 66 68 42 100 42 Z M100 60 C80 60 66 76 66 98 C66 124 80 146 100 150 C120 146 134 124 134 98 C134 76 120 60 100 60 Z"
                fillRule="evenodd" fill={url("hair")} />
              <path d="M66 98 C66 76 80 60 100 60 C120 60 134 76 134 98" fill="none" stroke="#fff" strokeOpacity="0.18" strokeWidth="2" />
              <path d="M58 120 C64 150 80 168 100 172 M142 120 C136 150 120 168 100 172" fill="none" stroke="#000" strokeOpacity="0.15" strokeWidth="1.5" />
              <path d="M78 48 C90 44 110 44 122 48" fill="none" stroke="#fff" strokeOpacity="0.2" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
          {(p.hair === "short" || p.hair === "neat") && (
            <>
              {/* hair mass with a natural hairline (temples recede a little) and a side part */}
              <path d={p.hair === "short"
                ? "M60 98 C55 64 76 41 103 42 C131 43 148 66 140 98 C138 88 135 80 131 75 C126 66 118 62 110 64 C104 58 92 58 84 62 C74 64 68 72 66 80 C63 86 61 92 60 98 Z"
                : "M61 96 C57 66 76 45 102 45 C128 45 146 66 139 96 C137 86 134 79 130 74 C124 68 116 65 108 66 C100 62 88 63 81 67 C72 70 67 78 65 85 C63 89 62 92 61 96 Z"}
                fill={url("hair")} />
              {/* side part and comb lines give it texture */}
              <path d={p.hair === "short" ? "M84 46 C82 52 82 58 84 62" : "M86 48 C84 54 84 60 86 65"} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M88 50 C100 46 116 47 128 56 M90 55 C102 51 118 52 130 61 M74 58 C78 53 82 51 86 50 M72 66 C75 60 79 56 84 55"
                fill="none" stroke="#fff" strokeOpacity={p.hair === "neat" ? 0.22 : 0.12} strokeWidth="1" strokeLinecap="round" />
              {/* short sides above the ears */}
              <path d="M60 98 C59 104 60 110 62 114 L64 112 C63 106 63 102 63 96 Z M140 98 C141 104 140 110 138 114 L136 112 C137 106 137 102 137 96 Z" fill={url("hair")} opacity="0.85" />
            </>
          )}
        </g>

        {laptop && (
          <g>
            <path d="M52 200 Q52 196 56 196 L144 196 Q148 196 148 200 L152 240 L48 240 Z" fill={url("laptop")} />
            <path d="M56 196 L144 196" stroke="#8b8fa3" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
            <circle cx="100" cy="219" r="4.5" fill="#f9a8d4" opacity="0.9" />
            <circle cx="100" cy="219" r="9" fill="#f9a8d4" opacity="0.18" />
          </g>
        )}
      </g>
    </svg>
  );
}
