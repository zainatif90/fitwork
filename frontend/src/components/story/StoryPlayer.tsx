/*
 * Plays the "How FitWork works" story like a short film, in English or Urdu:
 *  - a human narrator (Microsoft neural voices, pre-made MP3 files in /public/story, see scripts/make_narration.py)
 *  - original background music played live (lib/storyMusic.ts), quieter under the narrator
 *  - subtitles, a progress bar per scene (click to jump), play/pause, back/next, arrow keys and space.
 *
 * Timing: each scene lasts as long as its narration (or its animation, if longer). The scene's animations are
 * stretched to that length (the story clock's k), and the scene moves on when the progress bar has filled AND
 * the narrator has finished. Pausing pauses the animations, the voice and the music together.
 */
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Maximize2, Mic, MicOff, Minimize2, Music2, Pause, Play, RotateCcw, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { StoryMusic } from "../../lib/storyMusic";
import narration from "./narration.json";
import durations from "./narration-durations.json";
import { VISUALS } from "./Scenes";
import { Stage } from "./StoryParts";

type Lang = "en" | "ur";
const SCENES = narration.scenes;
const LANG_KEY = "fitwork.story.lang";
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const audioUrl = (lang: Lang, i: number) => `/story/${lang}/${String(i).padStart(2, "0")}-${SCENES[i].id}.mp3`;

function loadUrduFont(): void {
  if (document.getElementById("urdu-font")) return;
  const link = document.createElement("link");
  link.id = "urdu-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap";
  document.head.appendChild(link);
}

export function StoryPlayer() {
  const [lang, setLang] = useState<Lang>(() => {
    try { return localStorage.getItem(LANG_KEY) === "ur" ? "ur" : "en"; } catch { return "en"; }
  });
  const [started, setStarted] = useState(false); // browsers only allow sound after a click, so we start on one
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [run, setRun] = useState(0); // changes on every (re)start, so a scene replays from its beginning

  const scene = SCENES[index];
  const text = scene[lang];
  const visual = VISUALS[scene.id];
  const voiceSeconds = (durations as Record<Lang, number[]>)[lang][index] ?? 0;
  const sceneSeconds = voiceOn ? Math.max(visual.seconds, voiceSeconds + 0.9) : visual.seconds;
  const k = Math.min(3, sceneSeconds / visual.seconds);
  const ended = started && index === SCENES.length - 1 && paused;

  // Full screen: the real browser full screen where it exists, otherwise the player covers the window
  const shell = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [viewH, setViewH] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === shell.current);
    const onResize = () => setViewH(window.innerHeight);
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("resize", onResize);
    return () => { document.removeEventListener("fullscreenchange", onChange); window.removeEventListener("resize", onResize); };
  }, []);
  const toggleFull = () => {
    const el = shell.current;
    if (!el) return;
    if (full) {
      if (document.fullscreenElement) void document.exitFullscreen();
      setFull(false);
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFull(true));
    } else {
      setFull(true);
    }
  };

  const audio = useRef<HTMLAudioElement | null>(null);
  const preload = useRef<HTMLAudioElement | null>(null);
  const music = useRef<StoryMusic | null>(null);
  const barDone = useRef(false);
  const voiceDone = useRef(false);

  const go = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(SCENES.length - 1, i)));
    setRun((r) => r + 1);
  }, []);
  const next = useCallback(() => {
    if (index < SCENES.length - 1) go(index + 1);
    else setPaused(true);
  }, [index, go]);
  const nextRef = useRef(next);
  nextRef.current = next;
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  const maybeAdvance = useCallback(() => {
    if (barDone.current && (voiceDone.current || !voiceOnRef.current)) nextRef.current();
  }, []);

  // A new scene (or language, or replay) starts from zero
  useEffect(() => {
    barDone.current = false;
    voiceDone.current = false;
  }, [index, run, lang]);

  // Narrator: load this scene's voice, play it while the story plays
  useEffect(() => {
    if (!audio.current) {
      audio.current = new Audio();
      audio.current.preload = "auto";
    }
    const a = audio.current;
    a.onended = () => { voiceDone.current = true; maybeAdvance(); };
    if (!started || !voiceOn) { a.pause(); return; }
    a.src = audioUrl(lang, index);
    a.currentTime = 0;
    // fetch the next scene's voice in the background so there is no gap
    if (index + 1 < SCENES.length) { preload.current = new Audio(audioUrl(lang, index + 1)); preload.current.preload = "auto"; }
    if (!paused) void a.play().catch(() => undefined);
    // (play/pause is handled in the next effect, so pausing does not restart the voice)
  }, [started, voiceOn, lang, index, run, maybeAdvance]);

  // Pause / play: voice and music follow the story
  useEffect(() => {
    const a = audio.current;
    if (paused) {
      a?.pause();
      music.current?.pause();
    } else if (started) {
      if (a && voiceOn && !voiceDone.current && a.src) void a.play().catch(() => undefined);
      music.current?.resume();
    }
  }, [paused, started, voiceOn]);

  // Voice switched off mid-scene: do not wait for it any more
  useEffect(() => { if (!voiceOn) maybeAdvance(); }, [voiceOn, maybeAdvance]);
  useEffect(() => { music.current?.setDucked(voiceOn); }, [voiceOn]);
  useEffect(() => { if (lang === "ur") loadUrduFont(); }, [lang]);

  // Leaving the page: silence everything
  useEffect(() => () => { audio.current?.pause(); music.current?.stop(); }, []);

  const startMusic = () => {
    music.current ??= new StoryMusic();
    music.current.setDucked(voiceOn);
    music.current.start();
  };
  const start = (withSound: boolean) => {
    setVoiceOn(withSound);
    setMusicOn(withSound);
    setStarted(true);
    setPaused(false);
    go(0);
    if (withSound) {
      music.current ??= new StoryMusic();
      music.current.setDucked(true);
      music.current.start();
    }
  };
  const chooseLang = (l: Lang) => {
    setLang(l);
    setRun((r) => r + 1); // replay the current scene in the new language
    try { localStorage.setItem(LANG_KEY, l); } catch { /* private mode: not remembered */ }
  };
  const toggleMusic = () => {
    if (musicOn) music.current?.stop();
    else startMusic();
    setMusicOn(!musicOn);
  };
  const togglePlay = () => {
    if (!started) { start(true); return; }
    if (paused && musicOn && !music.current) startMusic();
    setPaused((p) => !p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (!started || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
      else if (e.key === "f" || e.key === "F") toggleFull();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, started, full]);

  const urdu = lang === "ur";
  const urduText = "font-[Noto_Nastaliq_Urdu,serif] leading-[2.1]";

  return (
    <div ref={shell} className={clsx(full && "fixed inset-0 z-[100] flex flex-col justify-center overflow-auto bg-[#12061a] p-4 sm:p-6", full && "story-full")}>
      {/* scene progress: one segment per scene */}
      <div className="mb-3 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${SCENES.length}, minmax(0, 1fr))` }}>
        {SCENES.map((s, i) => (
          <button key={s.id} onClick={() => { if (!started) setStarted(true); go(i); }} className="group text-left" aria-label={`Scene ${i + 1}: ${s.en.title}`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-brand-200/70">
              {i < index && <span className="block h-full w-full bg-brand-gradient" />}
              {i === index && started && (
                <span
                  key={`${run}-${lang}-${voiceOn}`}
                  className="block h-full w-full origin-left bg-brand-gradient"
                  style={{ animation: reducedMotion() ? "none" : `st-grow ${sceneSeconds}s linear both`, animationPlayState: paused ? "paused" : "running" }}
                  onAnimationEnd={() => { barDone.current = true; maybeAdvance(); }}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Stage paused={paused || !started} k={k} maxHeight={full ? viewH - 190 : undefined}>
          <div key={`${index}-${run}-${lang}`} className="absolute inset-0">{visual.render()}</div>
        </Stage>
        {!started && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 rounded-3xl bg-[#1c0a24]/80 p-6 text-center text-white">
            <p className="font-display text-2xl font-extrabold sm:text-4xl">How FitWork works</p>
            <p className="max-w-md text-sm text-white/75">A 3-minute story with a narrator and music. Choose your language:</p>
            <div className="inline-flex rounded-2xl bg-white/10 p-1 ring-1 ring-white/20">
              {(["en", "ur"] as Lang[]).map((l) => (
                <button key={l} onClick={() => chooseLang(l)}
                  className={clsx("rounded-xl px-5 py-2 text-sm font-semibold transition", lang === l ? "bg-white text-brand-800" : "text-white/80 hover:text-white")}>
                  {l === "en" ? "English" : <span className="font-[Noto_Nastaliq_Urdu,serif]">اردو</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => start(true)} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 font-semibold">
                <Play className="h-5 w-5" /> Play with sound
              </button>
              <button onClick={() => start(false)} className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 font-semibold hover:bg-white/10">
                <VolumeX className="h-4 w-4" /> Watch without sound
              </button>
            </div>
          </div>
        )}
      </div>

      {/* subtitle + controls */}
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div key={`c${index}-${run}-${lang}`} className="animate-fade-up min-w-0 flex-1" dir={urdu ? "rtl" : "ltr"}>
          <p className={clsx("text-xs font-bold uppercase tracking-wider", full ? "text-amber-300" : "text-brand-600", urdu && urduText)}>
            {urdu ? `مرحلہ ${index + 1} از ${SCENES.length} · ${text.title}` : `Step ${index + 1} of ${SCENES.length} · ${text.title}`}
          </p>
          <p className={clsx("mt-1 text-base sm:text-lg", full ? "text-white" : "text-slate-700", urdu ? urduText : "leading-relaxed")}>{text.caption}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-brand-200 bg-white p-0.5 shadow-soft">
            {(["en", "ur"] as Lang[]).map((l) => (
              <button key={l} onClick={() => chooseLang(l)} aria-label={l === "en" ? "English" : "Urdu"}
                className={clsx("rounded-lg px-2.5 py-1.5 text-sm font-semibold", lang === l ? "bg-brand-gradient text-white" : "text-brand-700 hover:bg-brand-50")}>
                {l === "en" ? "EN" : <span className="font-[Noto_Nastaliq_Urdu,serif] leading-none">اردو</span>}
              </button>
            ))}
          </div>
          <button onClick={() => setVoiceOn((v) => !v)} aria-label={voiceOn ? "Turn narrator off" : "Turn narrator on"} title={voiceOn ? "Narrator on" : "Narrator off"}
            className={clsx("rounded-xl border p-2.5 shadow-soft", voiceOn ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400")}>
            {voiceOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button onClick={toggleMusic} aria-label={musicOn ? "Turn music off" : "Turn music on"} title={musicOn ? "Music on" : "Music off"}
            className={clsx("rounded-xl border p-2.5 shadow-soft", musicOn ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-400")}>
            <Music2 className="h-5 w-5" />
          </button>
          <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous scene"
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50 disabled:opacity-40">
            <ChevronLeft className="h-5 w-5" />
          </button>
          {ended ? (
            <button onClick={() => { go(0); setPaused(false); }} className="btn-3d inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 font-semibold text-white">
              <RotateCcw className="h-4 w-4" /> Watch again
            </button>
          ) : (
            <button onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}
              className="btn-3d inline-flex w-28 items-center justify-center gap-2 rounded-xl bg-brand-gradient px-5 py-2.5 font-semibold text-white">
              {paused ? <><Play className="h-4 w-4" /> Play</> : <><Pause className="h-4 w-4" /> Pause</>}
            </button>
          )}
          <button onClick={() => go(index + 1)} disabled={index === SCENES.length - 1} aria-label="Next scene"
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50 disabled:opacity-40">
            <ChevronRight className="h-5 w-5" />
          </button>
          <button onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen (F)" : "Full screen (F)"}
            className="rounded-xl border border-brand-200 bg-white p-2.5 text-brand-700 shadow-soft hover:bg-brand-50">
            {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>
        </div>
      </div>
      <p className={clsx("mt-3 text-xs text-slate-400", full && "hidden")}>
        Illustrative story: the people, jobs and numbers are examples. Every step shown is how FitWork really works.
        Narrator: Microsoft neural voices. Music: original, made live in your browser. Keys: ← → to move, space to pause, F for full screen.
      </p>
    </div>
  );
}
