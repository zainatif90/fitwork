"""
Makes the narrator audio of the "How it works" story (run once after changing narration.json).

Voices: Microsoft neural text-to-speech voices (the "Read aloud" voices of Microsoft Edge), through the
free `edge-tts` tool. English: en-US-AndrewMultilingualNeural, Urdu: ur-PK-AsadNeural (set in narration.json).
Nothing is paid for; the files are made once and served with the website.

    pip install edge-tts mutagen
    python frontend/scripts/make_narration.py

Writes frontend/public/story/<lang>/<nn>-<id>.mp3 and frontend/src/components/story/narration-durations.json
(seconds per file, so each scene lasts as long as its narration).
"""
import asyncio
import json
import shutil
from pathlib import Path

import edge_tts
from mutagen.mp3 import MP3

FRONTEND = Path(__file__).resolve().parent.parent
SCRIPT = FRONTEND / "src" / "components" / "story" / "narration.json"
AUDIO_DIR = FRONTEND / "public" / "story"
DURATIONS = FRONTEND / "src" / "components" / "story" / "narration-durations.json"


async def main() -> None:
    data = json.loads(SCRIPT.read_text(encoding="utf-8"))
    durations: dict[str, list[float]] = {}
    for lang, voice in data["voices"].items():
        shutil.rmtree(AUDIO_DIR / lang, ignore_errors=True)  # no stale files from an older script
        (AUDIO_DIR / lang).mkdir(parents=True, exist_ok=True)
        durations[lang] = []
        for n, scene in enumerate(data["scenes"]):
            text = scene[lang].get("say") or scene[lang]["caption"]
            out = AUDIO_DIR / lang / f"{n:02d}-{scene['id']}.mp3"
            # slightly slower than default sounds calmer and clearer in an explainer;
            # the free service sometimes refuses a request, so try again after a short wait
            for attempt in range(5):
                try:
                    await edge_tts.Communicate(text, voice, rate="-4%").save(str(out))
                    break
                except Exception as err:  # noqa: BLE001 - network hiccup: wait and retry
                    print(f"  retry {attempt + 1} for {out.name}: {err}")
                    await asyncio.sleep(3 * (attempt + 1))
            else:
                raise RuntimeError(f"Could not make {out.name}")
            seconds = round(MP3(str(out)).info.length, 2)
            durations[lang].append(seconds)
            print(f"{lang} {out.name}: {seconds} s")
    DURATIONS.write_text(json.dumps(durations, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
