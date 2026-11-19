/*
 * Plays the "How FitWork works" story like a short film: progress bar per scene (click to jump), play/pause,
 * back/next, arrow keys and space. The progress bar IS the clock: when its fill animation ends, the next scene
 * starts, so pausing (which pauses every animation) also pauses the story. Only the current scene is mounted.
 */
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { SCENES } from "./Scenes";
import { Stage } from "./StoryParts";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function StoryPlayer() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(reducedMotion); // with "reduce motion" the story waits for the viewer
  const [run, setRun] = useState(0); // changes on every (re)start, so a scene replays from its beginning
  const ended = index === SCENES.length - 1 && paused;
  const scene = SCENES[index];

  const go = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(SCENES.length - 1, i)));
    setRun((r) => r + 1);
  }, []);
  const next = useCallback(() => {
    if (index < SCENES.length - 1) go(index + 1);
    else setPaused(true);
  }, [index, go]);
  const restart = () => { go(0); setPaused(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go]);

  return (
    <div>
      {/* scene progress: one segment per scene */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SCENES.length}, minmax(0, 1fr))` }}>
        {SCENES.map((s, i) => (
          <button key={s.title} onClick={() => go(i)} className="group text-left" aria-label={`Scene ${i + 1}: ${s.title}`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-brand-200/70">
              {i < index && <span className="block h-full w-full bg-brand-gradient" />}
              {i === index && (
                <span
                  key={run}
                  className="block h-full w-full origin-left bg-brand-gradient"
                  style={{
                    animation: reducedMotion() ? "none" : `st-grow ${s.seconds}s linear both`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                  onAnimationEnd={next}
                />
              )}
            </span>
            <span className={clsx("mt-1 hidden truncate text-[11px] font-semibold md:block", i === index ? "text-brand-700" : "text-slate-400 group-hover:text-slate-600")}>
              {s.title}
            </span>
          </button>
        ))}
      </div>

      <Stage paused={paused}>
        <div key={`${index}-${run}`} className="absolute inset-0">{scene.render()}</div>
      </Stage>

      {/* caption + controls */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div key={`c${index}-${run}`} className="animate-fade-up min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Step {index + 1} of {SCENES.length} · {scene.title}</p>
          <p className="mt-1 text-base leading-relaxed text-slate-700 sm:text-lg">{scene.caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous scene"
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50 disabled:opacity-40">
            <ChevronLeft className="h-5 w-5" />
          </button>
          {ended ? (
            <button onClick={restart} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 font-semibold text-white">
              <RotateCcw className="h-4 w-4" /> Watch again
            </button>
          ) : (
            <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"}
              className="btn-3d inline-flex w-28 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 font-semibold text-white">
              {paused ? <><Play className="h-4 w-4" /> Play</> : <><Pause className="h-4 w-4" /> Pause</>}
            </button>
          )}
          <button onClick={() => go(index + 1)} disabled={index === SCENES.length - 1} aria-label="Next scene"
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50 disabled:opacity-40">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Illustrative story: the people, jobs and numbers are examples. Every step shown is how FitWork really works.
        Keys: ← → to move, space to pause.
      </p>
    </div>
  );
}
