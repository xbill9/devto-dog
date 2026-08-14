#!/usr/bin/env python3
"""Normalise dropped photos into ground-truth-named eval fixtures.

    ./scripts/ingest_fixtures.py ~/Downloads/photos --label dog
    ./scripts/ingest_fixtures.py ~/Downloads/wolves --label notdog --subject "grey wolf"
    ./scripts/ingest_fixtures.py ~/Downloads/photos --label dog --dry-run

Ground truth is the filename, because that is where `scan_accuracy.py` looks:
`dog_*.jpg` scores as is_dog=True, `notdog_*.jpg` as False. Nothing else in the
tree records the expected answer, so the name is the contract.

Three things happen to every image on the way in:

**EXIF is stripped, and that is the point of this script existing.** Phone
photos carry GPS coordinates of wherever they were taken. These fixtures get
committed to a public repo and served over HTTP to a phone by the portal, so a
photo of a dog in a back garden would publish the back garden. Pillow only
copies EXIF when asked, so re-encoding through a bare `Image` drops it -- this
is verified in `--dry-run` rather than assumed.

**Long edge is capped.** A 4032px phone photo is ~40x the pixels the scanner
ever sees; the frames actually sent are VIDEO_WIDTHxVIDEO_HEIGHT (640x480 by
default). Big fixtures make the harness slow and the repo fat for no signal.

**A subject hint can be recorded alongside.** For the hard cases the verdict
alone is not the interesting part -- knowing the model said "husky" when the
truth was "grey wolf" is. Stored in fixtures.json, never in the filename, and
never rendered by the portal: on-screen text is in the camera frame, and the
model reads it.
"""

import argparse
import json
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures"
MAX_EDGE = 1600
SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=pathlib.Path, help="folder of photos to ingest")
    ap.add_argument(
        "--label",
        required=True,
        choices=("dog", "notdog"),
        help="ground truth for every image in this folder",
    )
    ap.add_argument(
        "--subject",
        default="",
        help='what these actually are, for the hard cases ("grey wolf", "plush toy")',
    )
    ap.add_argument("--max-edge", type=int, default=MAX_EDGE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.source.is_dir():
        print(f"not a directory: {args.source}", file=sys.stderr)
        return 1

    incoming = sorted(
        p for p in args.source.iterdir() if p.suffix.lower() in SUFFIXES
    )
    if not incoming:
        print(f"no images in {args.source}", file=sys.stderr)
        return 1

    dest = FIXTURES / f"{args.label}s"
    # Not on a dry run. The first version created it unconditionally, so a
    # "nothing written" run left an empty directory behind -- small, but a dry
    # run that touches the filesystem is not a dry run, and the whole point of
    # the flag is trusting what it says.
    if not args.dry_run:
        dest.mkdir(parents=True, exist_ok=True)

    # Continue the numbering rather than restarting it, so a second folder does
    # not overwrite the first.
    existing = sorted(dest.glob(f"{args.label}_*.jpg"))
    start = 1 + max(
        (int(p.stem.split("_")[-1]) for p in existing if p.stem.split("_")[-1].isdigit()),
        default=0,
    )

    manifest_path = FIXTURES / "fixtures.json"
    manifest = (
        json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    )

    for offset, src in enumerate(incoming):
        name = f"{args.label}_{start + offset:02d}.jpg"
        out = dest / name

        with Image.open(src) as im:
            had_exif = bool(im.getexif())
            im = im.convert("RGB")
            before = im.size
            im.thumbnail((args.max_edge, args.max_edge), Image.LANCZOS)

            if args.dry_run:
                print(
                    f"  {src.name} -> {name}  {before} -> {im.size}"
                    f"  exif:{'strip' if had_exif else 'none'}"
                )
                continue

            # No exif= kwarg: that is what drops the GPS tags.
            im.save(out, "JPEG", quality=90)

        manifest[name] = {"is_dog": args.label == "dog", "subject": args.subject}
        print(f"  {src.name} -> {out.relative_to(ROOT)}  {before} -> {im.size}")

    if args.dry_run:
        print(f"\ndry run: {len(incoming)} images, nothing written")
        return 0

    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"\n{len(incoming)} ingested -> {dest.relative_to(ROOT)}")
    print(f"manifest: {manifest_path.relative_to(ROOT)} ({len(manifest)} fixtures)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
