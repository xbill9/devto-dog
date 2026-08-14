#!/usr/bin/env python3
"""Fetch a public-domain / CC fixture set from Wikimedia Commons.

    ./scripts/fetch_public_fixtures.py            # download + record attribution
    ./scripts/fetch_public_fixtures.py --dry-run  # list what it would take

Exists so the eval is not blocked on anybody's personal photos. These are the
baseline set; real photos from a real phone are strictly better — they are the
actual demo condition — and `ingest_fixtures.py` adds them alongside.

**Attribution is not optional.** Most of Commons is CC BY or CC BY-SA, which
require credit, and this repo is published as part of a challenge submission.
Every file downloaded gets its title, author, licence and source URL written to
`tests/fixtures/ATTRIBUTION.md`. A fixture whose licence cannot be read is
skipped rather than guessed at.

The hard cases are the point. Anything can tell a retriever from a chair; the
eval only says something if it contains wolves, foxes, plush dogs, statues and
cartoons — the things that are dog-shaped and are not dogs.
"""

import argparse
import html
import json
import pathlib
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAGE = ROOT / "tests" / "fixtures" / "_incoming"
ATTRIB = ROOT / "tests" / "fixtures" / "ATTRIBUTION.md"
API = "https://commons.wikimedia.org/w/api.php"
UA = "dog-or-not-fixtures/1.0 (https://github.com/xbill9/devto-dog; dev.to challenge)"

# label -> (search term, how many, subject hint for fixtures.json)
QUERIES = [
    ("dog", "golden retriever dog photograph", 2, "golden retriever"),
    ("dog", "beagle dog photograph", 2, "beagle"),
    ("dog", "german shepherd dog photograph", 2, "german shepherd"),
    ("dog", "welsh corgi dog photograph", 2, "corgi"),
    ("notdog", "grey wolf canis lupus", 3, "grey wolf"),
    ("notdog", "red fox vulpes vulpes", 2, "red fox"),
    ("notdog", "coyote canis latrans", 2, "coyote"),
    ("notdog", "plush stuffed toy dog", 2, "plush toy"),
    ("notdog", "bronze dog statue sculpture", 2, "statue"),
    ("notdog", "domestic cat photograph", 2, "cat"),
]

# Licences that permit redistribution with credit. Anything else is skipped --
# "probably fine" is not a licence.
OK_LICENCE = re.compile(r"(public domain|cc0|cc by|cc-by)", re.I)

# Commons returns 429 well before this script finishes otherwise -- it did, at
# file 12 of 21. Be a polite client: space the requests out and back off rather
# than hammering a free service that is doing us a favour.
PAUSE_S = 1.5
RETRIES = 4


def fetch(url: str, timeout: int = 60) -> bytes:
    """GET with backoff on 429/5xx. Raises on anything else."""
    for attempt in range(RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or 500 <= e.code < 600:
                wait = PAUSE_S * (2 ** attempt) + 2
                print(f"      HTTP {e.code}; waiting {wait:.0f}s")
                time.sleep(wait)
                continue
            raise
    raise RuntimeError(f"gave up after {RETRIES} attempts: {url}")


def strip_html(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def search(term: str, limit: int) -> list[dict]:
    q = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"filetype:bitmap {term}", "gsrnamespace": "6",
        "gsrlimit": str(limit * 3), "prop": "imageinfo",
        "iiprop": "url|extmetadata", "iiurlwidth": "1400",
    }
    data = json.loads(fetch(f"{API}?{urllib.parse.urlencode(q)}", timeout=45))
    time.sleep(PAUSE_S)

    out = []
    for page in (data.get("query", {}).get("pages") or {}).values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata", {})
        licence = (meta.get("LicenseShortName") or {}).get("value", "")
        if not OK_LICENCE.search(licence):
            continue
        url = info.get("thumburl") or info.get("url")
        if not url:
            continue
        out.append(
            {
                "title": page.get("title", "").removeprefix("File:"),
                "url": url,
                "descurl": info.get("descriptionurl", ""),
                "licence": licence,
                "author": strip_html((meta.get("Artist") or {}).get("value", ""))[:80],
            }
        )
        if len(out) >= limit:
            break
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    credits, seen = [], set()
    for label, term, count, subject in QUERIES:
        try:
            hits = search(term, count)
        except Exception as e:
            print(f"  {term}: search failed ({e})")
            continue

        for h in hits:
            if h["title"] in seen:
                continue
            seen.add(h["title"])

            dest_dir = STAGE / f"{label}-{subject.replace(' ', '_')}"
            name = re.sub(r"[^A-Za-z0-9._-]", "_", h["title"])
            print(f"  [{label:<6}] {h['licence']:<16} {h['title'][:52]}")

            if not args.dry_run:
                dest_dir.mkdir(parents=True, exist_ok=True)
                out = dest_dir / name
                # Resume: a 429 partway through should not re-download what
                # already landed.
                if out.exists() and out.stat().st_size > 0:
                    print("           (already have it)")
                else:
                    out.write_bytes(fetch(h["url"]))
                    time.sleep(PAUSE_S)

            credits.append({**h, "label": label, "subject": subject})

    if args.dry_run:
        print(f"\ndry run: {len(credits)} files, nothing written")
        return 0

    lines = [
        "# Fixture attribution",
        "",
        "Eval fixtures sourced from Wikimedia Commons. Each file is listed with",
        "its author, licence and source page, as those licences require.",
        "",
        "Photographs taken for this project are not listed here -- they are the",
        "author's own.",
        "",
        "| File | Subject | Licence | Author | Source |",
        "|---|---|---|---|---|",
    ]
    for c in sorted(credits, key=lambda c: (c["label"], c["title"])):
        lines.append(
            f"| {c['title']} | {c['subject']} | {c['licence']} | "
            f"{c['author'] or '—'} | [Commons]({c['descurl']}) |"
        )
    ATTRIB.write_text("\n".join(lines) + "\n")

    print(f"\n{len(credits)} files -> {STAGE.relative_to(ROOT)}")
    print(f"attribution: {ATTRIB.relative_to(ROOT)}")
    print("\nNext: ingest each folder, e.g.")
    print("  ./scripts/ingest_fixtures.py tests/fixtures/_incoming/dog-beagle --label dog")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
