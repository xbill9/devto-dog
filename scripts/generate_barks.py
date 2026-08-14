#!/usr/bin/env python3
"""Generate the bark pack with the ElevenLabs Sound Effects API.

    ./scripts/generate_barks.py              # generate anything missing
    ./scripts/generate_barks.py --force      # regenerate everything
    ./scripts/generate_barks.py --dry-run    # list what would be requested

**Build time, never run time.** This writes MP3s into `frontend/public/audio/`
and is not called by the app. The running scanner plays a preloaded local file,
so the bark costs no network, adds no latency to the response path, and cannot
fail during a session. That was the whole argument for using ElevenLabs here
rather than as a streaming voice -- this project already measured what a second
audio stream does to a Live session, and it was 0/5.

Several variants, not one. A demo scans a dozen things in a row, and the same
17KB of audio a dozen times reads as a UI sound rather than a dog. The pack is
picked from at random at the call site.

Requires ELEVENLABS_API_KEY in the environment or .env. **Attribution**: the
free tier requires crediting elevenlabs.io, which the submission post does.
"""

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "frontend" / "public" / "audio"
ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation"

# Prompts live here rather than in a notebook somewhere, so the pack is
# reproducible and the wording is reviewable. "Dry" and "close mic" matter: a
# reverberant bark sounds like a recording of a room, and the illusion is that
# the machine in front of you barked.
BARKS = {
    "bark_1.mp3": "a single sharp dog bark, close mic, dry, no reverb",
    "bark_2.mp3": "one deep gruff dog bark from a large dog, close mic, dry",
    "bark_3.mp3": "two quick excited dog barks, small dog, close mic, dry",
    "bark_4.mp3": "a short low woof from a big dog, close mic, dry, no echo",
}
DURATION_S = 1.2
PROMPT_INFLUENCE = 0.6


def load_key() -> str:
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if key:
        return key
    env = ROOT / ".env"
    if env.is_file():
        for line in env.read_text().splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return ""


def generate(key: str, prompt: str) -> bytes:
    payload = json.dumps(
        {
            "text": prompt,
            "duration_seconds": DURATION_S,
            "prompt_influence": PROMPT_INFLUENCE,
        }
    ).encode()
    req = urllib.request.Request(
        ENDPOINT,
        data=payload,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        return resp.read()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenerate existing clips")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    key = load_key()
    if not key and not args.dry_run:
        print("ELEVENLABS_API_KEY not set (env or .env)", file=sys.stderr)
        return 1

    if not args.dry_run:
        OUT_DIR.mkdir(parents=True, exist_ok=True)

    written = []
    for name, prompt in BARKS.items():
        out = OUT_DIR / name
        if out.exists() and not args.force:
            print(f"  {name}: exists, skipping (--force to regenerate)")
            written.append(name)
            continue
        if args.dry_run:
            print(f"  {name}: would request {prompt!r}")
            continue
        try:
            audio = generate(key, prompt)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:300]
            print(f"  {name}: HTTP {e.code} — {body}", file=sys.stderr)
            return 1
        out.write_bytes(audio)
        print(f"  {name}: {len(audio):,} bytes  ({prompt})")
        written.append(name)

    if args.dry_run:
        print(f"\ndry run: {len(BARKS)} clips, nothing written")
        return 0

    # The manifest is what bark.js reads, so adding a clip here is the only step
    # needed to put it in rotation.
    manifest = OUT_DIR / "barks.json"
    manifest.write_text(
        json.dumps(
            {
                "credit": "Sound effects generated with ElevenLabs (elevenlabs.io)",
                "clips": [f"/audio/{n}" for n in sorted(written)],
            },
            indent=2,
        )
        + "\n"
    )
    total = sum((OUT_DIR / n).stat().st_size for n in written)
    print(f"\n{len(written)} clips, {total:,} bytes total -> {OUT_DIR.relative_to(ROOT)}")
    print(f"manifest: {manifest.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
