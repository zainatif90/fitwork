import { describe, expect, it } from "vitest";

import { bestVoice, sentences } from "./narrator";

const v = (name: string, lang = "en-US") => ({ name, lang }) as SpeechSynthesisVoice;

describe("narrator", () => {
  it("splits narration into sentences", () => {
    expect(sentences("Meet Sara. She is a freelancer! Ready?")).toEqual(["Meet Sara.", "She is a freelancer!", "Ready?"]);
    expect(sentences("")).toEqual([]);
  });

  it("prefers a natural English voice", () => {
    const voices = [v("Microsoft David", "en-US"), v("Microsoft Aria Online (Natural)", "en-US"), v("Google Deutsch", "de-DE")];
    expect(bestVoice(voices)?.name).toBe("Microsoft Aria Online (Natural)");
  });

  it("falls back to any English voice, and never picks another language", () => {
    expect(bestVoice([v("Google Deutsch", "de-DE"), v("Some Voice", "en-GB")])?.name).toBe("Some Voice");
    expect(bestVoice([v("Google Deutsch", "de-DE")])).toBeNull();
  });
});
