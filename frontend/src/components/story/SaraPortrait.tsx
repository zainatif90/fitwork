/*
 * Sara, the main character of the story: an editorial-style portrait (SVG) with real proportions, soft shading,
 * natural blinking and breathing, and facial expressions that change smoothly during a scene
 * (eyebrows, eyes, mouth and head tilt morph with CSS transitions).
 *
 * moods: [mood, second][] - e.g. [["neutral", 0], ["confused", 3], ["stressed", 8]] (seconds of the scene).
 */
import { useContext, useEffect, useRef, useState } from "react";

import { StoryClock } from "./StoryParts";

export type Mood = "neutral" | "confused" | "stressed" | "curious" | "hopeful" | "focused" | "happy" | "proud";

type Face = {
  browL: string; browR: string;   // eyebrow curves
  mouth: string;                  // lips outline (same commands in every mood so it can morph)
  teeth: number;                  // 0..1 visibility of the teeth (open smile)
  open: number;                   // eye openness (scaleY)
  look: [number, number];         // where the irises point
  tilt: number;                   // head tilt in degrees
};

// Mouth = M left Q upper right Q lower left Z  (corners and the two lip curves)
const mouth = (lx: number, ly: number, ux: number, uy: number, rx: number, ry: number, dx: number, dy: number) =>
  `M${lx} ${ly} Q${ux} ${uy} ${rx} ${ry} Q${dx} ${dy} ${lx} ${ly} Z`;
const brow = (x1: number, y1: number, cx: number, cy: number, x2: number, y2: number) => `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;

const FACES: Record<Mood, Face> = {
  neutral:  { browL: brow(73, 90, 82, 86, 92, 89), browR: brow(108, 89, 118, 86, 127, 90), mouth: mouth(90, 131, 100, 129.5, 110, 131, 100, 135), teeth: 0, open: 1, look: [0, 0], tilt: 0 },
  confused: { browL: brow(73, 87, 82, 80, 92, 85), browR: brow(108, 91, 118, 90, 127, 93), mouth: mouth(91, 132.5, 100, 130.5, 109, 130, 101, 134), teeth: 0, open: 1.05, look: [3, -2], tilt: 6 },
  stressed: { browL: brow(73, 92, 83, 89, 92, 86), browR: brow(108, 86, 117, 89, 127, 92), mouth: mouth(90, 134, 100, 130.5, 110, 134, 100, 133.5), teeth: 0, open: 0.85, look: [-2, 1], tilt: -3 },
  curious:  { browL: brow(73, 87, 82, 82, 92, 85), browR: brow(108, 85, 118, 82, 127, 87), mouth: mouth(94, 131, 100, 128.5, 106, 131, 100, 136), teeth: 0, open: 1.12, look: [2, -1], tilt: 3 },
  hopeful:  { browL: brow(73, 88, 82, 83, 92, 86), browR: brow(108, 86, 118, 83, 127, 88), mouth: mouth(89, 129.5, 100, 130, 111, 129.5, 100, 136), teeth: 0, open: 1.05, look: [1, -1], tilt: 2 },
  focused:  { browL: brow(73, 91, 82, 88, 92, 89), browR: brow(108, 89, 118, 88, 127, 91), mouth: mouth(91, 131.5, 100, 130.5, 109, 131.5, 100, 134), teeth: 0, open: 0.92, look: [2, 2], tilt: -2 },
  happy:    { browL: brow(73, 88, 82, 83, 92, 87), browR: brow(108, 87, 118, 83, 127, 88), mouth: mouth(87, 127.5, 100, 130, 113, 127.5, 100, 141), teeth: 1, open: 0.82, look: [0, 0], tilt: 3 },
  proud:    { browL: brow(73, 89, 82, 85, 92, 88), browR: brow(108, 88, 118, 85, 127, 89), mouth: mouth(88, 129, 100, 131, 112, 128, 101, 137.5), teeth: 0.6, open: 0.9, look: [0, -1], tilt: -4 },
};

/** Which mood is active now, following the scene clock (pauses with the story, stretched with the narration). */
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
      const t = elapsed.current / 1000;
      let current = moods[0][0];
      for (const [m, at] of moods) if (t >= at * k) current = m;
      setMood(current);
    }, 120);
    return () => window.clearInterval(id);
  }, [paused, k, moods]);
  return mood;
}

export function SaraPortrait({ moods, size = 240, laptop = false }: { moods: [Mood, number][]; size?: number; laptop?: boolean }) {
  const f = FACES[useMood(moods)];
  const t = "0.6s cubic-bezier(0.3, 0.7, 0.3, 1)";
  const morph = { transition: `d ${t}` };
  const eye = (cx: number) => (
    <g transform={`translate(${cx} 104)`}>
      <g className="sara-blink">
        <g style={{ transform: `scaleY(${f.open})`, transition: `transform ${t}` }}>
          <path d="M-9 0 Q0 -6.2 9 0 Q0 5.2 -9 0 Z" fill="#fbf7f4" />
          <g style={{ transform: `translate(${f.look[0]}px, ${f.look[1]}px)`, transition: `transform ${t}` }}>
            <circle r="3.9" fill="url(#sara-iris)" />
            <circle r="1.7" fill="#120804" />
            <circle cx="-1.2" cy="-1.3" r="0.95" fill="#fff" />
          </g>
          {/* upper lid and lashes */}
          <path d="M-9.6 0.4 Q0 -7.2 9.6 0.4" fill="none" stroke="#24140b" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M-9 0.3 Q0 4.6 9 0.3" fill="none" stroke="#b07a5e" strokeWidth="0.6" opacity="0.6" />
        </g>
      </g>
    </g>
  );
  return (
    <svg viewBox="0 0 200 240" width={size} height={size * 1.2} className="sara-portrait overflow-visible" aria-label="Sara"
      style={{ WebkitMaskImage: "linear-gradient(to bottom, #000 82%, transparent)", maskImage: "linear-gradient(to bottom, #000 82%, transparent)" }}>
      <defs>
        <radialGradient id="sara-skin" cx="0.42" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#f6d3b8" />
          <stop offset="0.65" stopColor="#e2aa86" />
          <stop offset="1" stopColor="#c98a66" />
        </radialGradient>
        <linearGradient id="sara-neck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c7896a" />
          <stop offset="0.5" stopColor="#dca181" />
        </linearGradient>
        <linearGradient id="sara-hair" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2416" />
          <stop offset="1" stopColor="#150b06" />
        </linearGradient>
        <linearGradient id="sara-blazer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6b2a7a" />
          <stop offset="1" stopColor="#2e0f3a" />
        </linearGradient>
        <linearGradient id="sara-laptop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4d5e" />
          <stop offset="1" stopColor="#23242e" />
        </linearGradient>
        <radialGradient id="sara-iris" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#7a4a26" />
          <stop offset="1" stopColor="#2e1a0c" />
        </radialGradient>
      </defs>

      <g className="sara-breathe">
        {/* hair behind the shoulders */}
        <path d="M58 92 C52 140 50 190 62 214 L138 214 C150 190 148 140 142 92 C136 60 64 60 58 92 Z" fill="url(#sara-hair)" />
        {/* shoulders, blazer and top */}
        <path d="M18 240 C20 206 40 190 72 182 L100 196 L128 182 C160 190 180 206 182 240 Z" fill="url(#sara-blazer)" />
        <path d="M84 180 L100 214 L116 180 Z" fill="#f3e8ee" />
        <path d="M72 182 L100 216 L86 240 L62 240 C64 214 66 196 72 182 Z" fill="#7a3389" opacity="0.65" />
        <path d="M128 182 L100 216 L114 240 L138 240 C136 214 134 196 128 182 Z" fill="#5a2167" opacity="0.65" />
        {/* neck */}
        <path d="M86 140 L86 180 Q100 192 114 180 L114 140 Z" fill="url(#sara-neck)" />
        <path d="M86 150 Q100 162 114 150 L114 158 Q100 168 86 158 Z" fill="#a8684b" opacity="0.35" />

        {/* head (tilts) */}
        <g style={{ transform: `rotate(${f.tilt}deg)`, transformOrigin: "100px 150px", transition: `transform ${t}` }}>
          <ellipse cx="61.5" cy="106" rx="4.5" ry="8" fill="#d39672" />
          <ellipse cx="138.5" cy="106" rx="4.5" ry="8" fill="#d39672" />
          <path d="M100 54 C129 54 140 76 139 101 C138 128 121 151 100 153 C79 151 62 128 61 101 C60 76 71 54 100 54 Z" fill="url(#sara-skin)" />
          {/* soft cheek warmth and jaw shadow */}
          <ellipse cx="78" cy="122" rx="9" ry="5.5" fill="#e8907a" opacity="0.22" />
          <ellipse cx="122" cy="122" rx="9" ry="5.5" fill="#e8907a" opacity="0.22" />
          <path d="M66 118 C70 138 84 150 100 153 C88 148 74 136 66 118 Z" fill="#a8684b" opacity="0.18" />
          {/* nose */}
          <path d="M101 104 C100 112 97 117 96.5 120.5 Q100 123.5 104 120.8" fill="none" stroke="#a96f52" strokeWidth="1.3" strokeLinecap="round" opacity="0.75" />
          {/* eyes and brows */}
          {eye(83)}
          {eye(117)}
          <path d={f.browL} style={morph} fill="none" stroke="#2a170c" strokeWidth="3.2" strokeLinecap="round" />
          <path d={f.browR} style={morph} fill="none" stroke="#2a170c" strokeWidth="3.2" strokeLinecap="round" />
          {/* mouth */}
          <path d={f.mouth} style={morph} fill="#a3404d" />
          <path d="M91 131.2 Q100 133.6 109 131.2 L108 133.2 Q100 135.4 92 133.2 Z" fill="#fff" style={{ opacity: f.teeth, transition: `opacity ${t}` }} />
          {/* hair: side-swept front */}
          <path d="M60 104 C56 70 76 48 103 49 C128 50 145 68 141 104 C137 86 128 72 112 66 C102 80 84 88 66 90 C63 94 61 99 60 104 Z" fill="url(#sara-hair)" />
          <path d="M104 52 C92 58 80 70 74 86" fill="none" stroke="#5a3a24" strokeWidth="1.6" opacity="0.55" strokeLinecap="round" />
          <path d="M116 56 C126 62 134 74 137 90" fill="none" stroke="#5a3a24" strokeWidth="1.4" opacity="0.45" strokeLinecap="round" />
        </g>

        {laptop && (
          <g>
            {/* the back of a dark laptop, its glowing logo, and screen light on her face */}
            <path d="M52 200 Q52 196 56 196 L144 196 Q148 196 148 200 L152 240 L48 240 Z" fill="url(#sara-laptop)" />
            <path d="M56 196 L144 196" stroke="#8b8fa3" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
            <circle cx="100" cy="219" r="4.5" fill="#f9a8d4" opacity="0.9" />
            <circle cx="100" cy="219" r="9" fill="#f9a8d4" opacity="0.18" />
          </g>
        )}
      </g>
    </svg>
  );
}
