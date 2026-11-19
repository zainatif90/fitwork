/*
 * Narration for the "How it works" story with the browser's built-in voices (Web Speech API):
 * free, no audio files, no outside service. We pick the most natural English voice the device has
 * (Edge "Natural" voices, Chrome's Google voices, Apple's voices...).
 *
 * Text is spoken one sentence at a time: long utterances are cut off by some browsers, and it lets
 * a paused story resume from the sentence it was on.
 */

export const speechSupported = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

// Most natural first
const PREFERRED = [/natural/i, /google us english/i, /google uk english female/i, /\b(aria|jenny|libby|sonia|ava|emma)\b/i, /samantha|karen|moira/i, /google/i];

/** The best English voice available on this device (or null = browser default). */
export function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  for (const pattern of PREFERRED) {
    const v = english.find((x) => pattern.test(x.name));
    if (v) return v;
  }
  return english.find((v) => v.lang.toLowerCase() === "en-us") ?? english[0] ?? null;
}

/** Split narration into sentences (keeps the full stop with each sentence). */
export function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

/**
 * Speaks a list of sentences starting at `from`. Calls onSentence(i) as each starts and onDone() at the end.
 * Returns a stop function; after stop, no callbacks fire (a cancelled utterance also ends silently).
 */
export function speak(list: string[], from: number, onSentence: (i: number) => void, onDone: () => void): () => void {
  let active = true;
  const synth = window.speechSynthesis;
  const voice = bestVoice(synth.getVoices());
  const say = (i: number) => {
    if (!active) return;
    if (i >= list.length) { onDone(); return; }
    onSentence(i);
    const u = new SpeechSynthesisUtterance(list[i]);
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    u.rate = 1;
    u.pitch = 1;
    u.onend = () => say(i + 1);
    u.onerror = (e) => { if (e.error !== "interrupted" && e.error !== "canceled") say(i + 1); };
    synth.speak(u);
  };
  synth.cancel();
  say(from);
  return () => { active = false; synth.cancel(); };
}
