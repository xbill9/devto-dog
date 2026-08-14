# Dog or Not

A live-video security scanner with one job: you hold something up to the camera,
say **"scan"**, and it tells you whether it is a dog. If it is, it barks.

It is deliberately not charming about it. The scanner is a cold
threat-assessment system that happens to have been pointed at dogs, and the
entire joke is that it does not know it is making one.

> Built for the [DEV Weekend Challenge: Dog Days Edition](https://dev.to/challenges/weekend-2026-08-13).

## Credit where it is due

This is a fork of **[way-back-home/level_3_new](https://github.com/xbill9/way-back-home)**,
which was the same scanner counting fingers for a biometric handshake. The
multimodal plumbing — bidirectional WebSocket, 1 FPS video, local wake-word
detection, the accuracy harness, the Cloud Run deploy chain — came from there
and is the reason this exists at all in a weekend.

What is new here: the classifier and its tools, the verdict UI, the bark pack,
the containment-breach easter egg, the fixture portal, and the ingest and
publish-safety scripts.

## How it works

```
phone/photo → webcam → 1 FPS JPEG ─┐
                                   ├─→ Gemini Live (ADK) ─→ report_verdict() ─→ UI + bark
             "scan" ───────────────┘
             (Web Speech API, stays in the browser)
```

The microphone never reaches the model. Its only job is catching the word
"scan", and doing that in the browser rather than over the wire saves about two
thirds of the uplink — continuous audio also reads to the Live API as a user
turn that never ends, which stops the model taking turns of its own. Measured:
0/5 with speech in the room, 5/5 for the identical prompts sent as text.

The verdict comes back as a **tool call**, not prose to be parsed:

```python
report_verdict(is_dog=False, confidence=71, subject="grey wolf")
```

A wolf is not a dog. Neither is a plush one, a statue, a cartoon, or a person in
a costume. That is a choice rather than a fact, and it is the choice that makes
the eval interesting instead of a formality — "is this a dog" is otherwise
solved zero-shot and there is nothing to measure.

Judging is on the **subject depicted, never the medium**. Photographs on a phone
screen are the expected mode of operation, so a photo of a real dog is a dog.

### Easter eggs

| Trigger | Result |
|---|---|
| A cat | Fatal system error. Scanner integrity lost. |
| Three or more dogs in one frame | **Containment breach**, announced in whichever of nine languages is selected |

The breach announcement is translated by the model itself rather than read from
a shipped phrasebook — so it is real evidence the model is being called, in a
way a recording could not fake.

## Running it

```bash
./init.sh              # one-time: project and API key
./frontend.sh          # build the UI
./runadk.sh            # backend on :8080

npm --prefix frontend run dev   # or Vite on :5173 for development
```

`./mock.sh` runs a mock backend that simulates the model, so the UI can be
worked on without billing a Live session.

### The fixture portal

`http://localhost:5173/portal.html` — the eval fixtures as a full-bleed,
swipeable gallery, for a phone held up to the webcam. Vite binds all interfaces,
so the phone reaches it at `http://<your-ip>:5173/portal.html`.

Ground truth is withheld unless you press **truth**. Anything the page shows is
inside the camera's field of view, and a scanner that scores well because it
read "grey wolf" off the screen has measured the font.

Expect the phone path to score worse than the harness. It adds glare, moiré,
refresh banding and a bezel. That is the demo condition, not a regression.

### Adding fixtures

```bash
./scripts/ingest_fixtures.py ~/photos/dogs --label dog
./scripts/ingest_fixtures.py ~/photos/statues --label notdog --subject "bronze statue"
```

Strips EXIF — phone photos carry GPS, and these are published — caps the long
edge, and names files as the ground-truth contract (`dog_*.jpg` / `notdog_*.jpg`).

**Frame at least half of them the way a phone actually presents them**: held up,
small in frame. The previous build shipped a video resolution chosen from a
fixture set where every subject filled the frame, and it made real-world
accuracy visibly worse.

## Measuring it

```bash
./scripts/scan_accuracy.py                    # baseline
./scripts/scan_accuracy.py --lighting dark    # one degraded condition
./scripts/scan_accuracy.py --matrix --json out.json
```

Drives the real WebSocket endpoint with fixture images and a text stimulus, then
scores what the model did against known ground truth, with bandwidth and latency
accounting. **Billed**: one real Live session per condition.

`make test` stubs the model entirely, so it cannot see model behaviour at all.
This is the only thing here that measures the model rather than the plumbing.

## Deploying

```bash
make deploy          # Cloud Run, via deploy.sh
```

`make test` and `make deploy` both run `scripts/check_no_eap.sh` first, which
fails if anything git would publish names a non-public model. The model id comes
from `MODEL_ID` and defaults to GA; the tree never names anything else.

**The scanner prints its live model id in the header**, deliberately — it proves
which model is behind the glass. That also means a screen recording made against
a non-public model publishes the id in pixels, where no repo scan can catch it.
Record with `MODEL_ID` unset.

## Credits

Sound effects generated with **[ElevenLabs](https://elevenlabs.io)**. Barks are
produced at build time by `scripts/generate_barks.py` and bundled — nothing here
calls a sound API at runtime, so the bark adds no latency to the response path
and cannot fail during a session.

The build diary is in [`BUILD-LOG.md`](BUILD-LOG.md), written tick by tick as
the thing was built. It is the honest version, including the parts that broke.

MIT.
