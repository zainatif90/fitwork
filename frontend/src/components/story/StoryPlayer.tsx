/*
 * Plays the "How FitWork works" story like a short film: progress bar per scene (click to jump), play/pause,
 * back/next, arrow keys and space, and an optional narrator voice (lib/narrator.ts).
 *
 * Timing: the progress bar IS the clock. A scene moves on when its bar has filled AND (with the voice on) the
 * narrator has finished speaking, so the voice is never cut off. Pausing pauses every animation and stops the
 * voice; playing again repeats the sentence it was on. Only the current scene is mounted.
 */
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { sentences, speak, speechSupported } from "../../lib/narrator";
import { SCENES } from "./Scenes";
import { Stage } from "./StoryParts";

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const VOICE_KEY = "fitwork.story.voice";

export function StoryPlayer() {
  const canSpeak = speechSupported();
  const [started, setStarted] = useState(false); // browsers only allow speech after a click, so we start on one
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true);
  const [voice, setVoice] = useState(() => {
    try { return canSpeak && localStorage.getItem(VOICE_KEY) !== "off"; } catch { return canSpeak; }
  });
  const [run, setRun] = useState(0); // changes on every (re)start, so a scene replays from its beginning
  const ended = started && index === SCENES.length - 1 && paused;
  const scene = SCENES[index];

  // Per-scene progress: has the bar filled, has the narrator finished, which sentence is being spoken
  const barDone = useRef(false);
  const speechDone = useRef(false);
  const sentence = useRef(0);

  const go = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(SCENES.length - 1, i)));
    setRun((r) => r + 1);
  }, []);
  const next = useCallback(() => {
    if (index < SCENES.length - 1) go(index + 1);
    else setPaused(true);
  }, [index, go]);

  // Move on only when both the animation time and the narration are over
  const nextRef = useRef(next);
  nextRef.current = next;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const maybeAdvance = useCallback(() => {
    if (barDone.current && (speechDone.current || !voiceRef.current)) nextRef.current();
  }, []);

  // A new scene (or a replay) starts from zero
  useEffect(() => {
    barDone.current = false;
    speechDone.current = false;
    sentence.current = 0;
  }, [index, run]);

  // Narrator: speaks while playing with the voice on; stops on pause, scene change or leaving the page
  useEffect(() => {
    if (!canSpeak || !started || paused) return;
    if (!voice) { maybeAdvance(); return; }
    if (speechDone.current) { maybeAdvance(); return; }
    const list = sentences(scene.voice ?? scene.caption);
    return speak(list, sentence.current, (i) => { sentence.current = i; }, () => { speechDone.current = true; maybeAdvance(); });
  }, [canSpeak, started, paused, voice, index, run, scene, maybeAdvance]);

  // Load the device's voices early (they arrive asynchronously in some browsers)
  useEffect(() => { if (canSpeak) window.speechSynthesis.getVoices(); }, [canSpeak]);

  const start = (withVoice: boolean) => {
    setVoice(withVoice);
    setStarted(true);
    setPaused(false);
    go(0);
  };
  const toggleVoice = () => {
    setVoice((v) => {
      try { localStorage.setItem(VOICE_KEY, v ? "off" : "on"); } catch { /* private mode: not remembered */ }
      return !v;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!started || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, started]);

  return (
    <div>
      {/* scene progress: one segment per scene */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SCENES.length}, minmax(0, 1fr))` }}>
        {SCENES.map((s, i) => (
          <button key={s.title} onClick={() => { if (!started) setStarted(true); go(i); }} className="group text-left" aria-label={`Scene ${i + 1}: ${s.title}`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-brand-200/70">
              {i < index && <span className="block h-full w-full bg-brand-gradient" />}
              {i === index && started && (
                <span
                  key={run}
                  className="block h-full w-full origin-left bg-brand-gradient"
                  style={{
                    animation: reducedMotion() ? "none" : `st-grow ${s.seconds}s linear both`,
                    animationPlayState: paused ? "paused" : "running",
                  }}
                  onAnimationEnd={() => { barDone.current = true; maybeAdvance(); }}
                />
              )}
            </span>
            <span className={clsx("mt-1 hidden truncate text-[11px] font-semibold md:block", i === index ? "text-brand-700" : "text-slate-400 group-hover:text-slate-600")}>
              {s.title}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Stage paused={paused}>
          <div key={`${index}-${run}`} className="absolute inset-0">{scene.render()}</div>
        </Stage>
        {!started && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-3xl bg-[#1c0a24]/75 p-6 text-center text-white">
            <p className="font-display text-2xl font-extrabold sm:text-3xl">How FitWork works</p>
            <p className="max-w-md text-sm text-white/75">A 90-second story in 9 scenes{canSpeak ? ", with a narrator" : ""}.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => start(canSpeak)} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 font-semibold">
                <Play className="h-5 w-5" /> {canSpeak ? "Play with narration" : "Play"}
              </button>
              {canSpeak && (
                <button onClick={() => start(false)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 font-semibold hover:bg-white/10">
                  <VolumeX className="h-4 w-4" /> Watch without sound
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* caption (= subtitle of the narration) + controls */}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div key={`c${index}-${run}`} className="animate-fade-up min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600">Step {index + 1} of {SCENES.length} · {scene.title}</p>
          <p className="mt-1 text-base leading-relaxed text-slate-700 sm:text-lg">{scene.caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canSpeak && (
            <button onClick={toggleVoice} aria-label={voice ? "Turn narration off" : "Turn narration on"} title={voice ? "Narration on" : "Narration off"}
              className={clsx("rounded-xl border p-2.5 shadow-soft", voice ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400")}>
              {voice ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </button>
          )}
          <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous scene"
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50 disabled:opacity-40">
            <ChevronLeft className="h-5 w-5" />
          </button>
          {ended ? (
            <button onClick={() => { go(0); setPaused(false); }} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 font-semibold text-white">
              <RotateCcw className="h-4 w-4" /> Watch again
            </button>
          ) : (
            <button onClick={() => { setStarted(true); setPaused((p) => !p); }} aria-label={paused ? "Play" : "Pause"}
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
        {canSpeak && " The voice is your browser's own built-in voice."} Keys: ← → to move, space to pause.
      </p>
    </div>
  );
}
