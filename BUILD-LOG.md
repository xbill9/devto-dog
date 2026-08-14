# Dog or Not — build log

A live-video security scanner that judges whether the thing you are holding up
is a dog, and barks if it is. Forked from
[way-back-home/level_3_new](https://github.com/xbill9/way-back-home), which was
the same scanner counting fingers.

Built with loop-driven development, self-paced. Each tick appends an entry
below. **This file is the spine of the submission post** — the "How I Built It"
section is written from it, so entries need to be honest about what failed, not
just what shipped. A dogfooding post where the tool works perfectly is an
advertisement.

**Deadline: Aug 17 2026, 06:59 UTC.**

---

## Decisions already made — do not re-litigate

| Decision | Why |
|---|---|
| Keep ADK | Already wired. Tool-calling is how the verdict comes back structured instead of parsed out of prose. |
| Keep the cold robotic persona | A deadpan military security system whose only output is barking is the joke. Making it cute kills it. |
| No Gemma fine-tune | "Is this a dog" is ~solved zero-shot. Fine-tuning a solved problem is a weak story, and a self-hosted rig can't stay up until Sept 3 judging. |
| ElevenLabs at build time only | Runtime TTS would be a second streaming vendor on the response path. The first build already paid for exactly this mistake on the uplink. |
| **The verdict is spoken, not sampled** | The scanner says "Woof." itself, in the selected language, in the same flat voice it reads out a wolf. A realistic bark over the top turns a machine *reporting* a dog into an app *impersonating* one. Sampled barks fire only on the containment breach, where three dogs really are loose. |
| Keep Gemini's audio for now | Multilanguage comes free through it at zero build cost. Phase 2 (pre-rendered multilingual voice pack, audio modality off) is a stretch goal, not scope. |
| No "Who Let the Dogs Out" | Copyright. `heavyMetalSting.js` exists because the War Pigs hotlink hit this already. The scanner announces a *containment breach* instead — funnier, and nothing to license. |
| Recorded video is the primary demo | Asking a judge for webcam access and a dog picture is too much friction. Live Cloud Run is the bonus. |
| **Nothing EAP ships** | The post, the public repo and the demo video all go out in the open. Model id comes from `MODEL_ID` only, defaulting to GA; the preview id lives in a gitignored `.env`. Measure and write against the GA model so no finding needs redacting. **Task #11 blocks both deploy and post.** |

## What the fork already gave us

- `wakeWord.js` — local "scan" detection, Web Speech API, mis-hearings matched, 1/sec debounce. Mic never reaches the Live API.
- Frame capture on wake word — already committed upstream.
- `heavyMetalSting.js` — tool-call → local audio hook. The bark pattern, already built.
- `scripts/scan_accuracy.py` — real eval harness against ground truth, with a lighting/noise degradation matrix.
- Mock mode — iterate without burning Live API credits.
- Cloud Run deploy chain: `Dockerfile`, `cloudbuild.yaml`, `make deploy`.

## Open questions

- Dog images from the user. Not-dogs and hard cases (wolf, plush, statue, cartoon, photo-of-a-photo) sourced here.
- Which languages for the containment-breach easter egg.
- Whether Phase 2 gets earned before the deadline.

---

## Ticks

<!-- newest last. one entry per tick:
     ## <n> — <what changed>
     what moved, what broke, what the accuracy run said, what it cost -->

## 1 — the agent stops counting fingers

Rewrote `backend/app/biometric_agent/agent.py`. `report_digit(count)` became
`report_verdict(is_dog, confidence, subject)`; the middle-finger easter egg
became a cat, and the Devil's Horns easter egg became three or more dogs in one
frame — which is the containment breach, so the trigger now earns the joke
instead of being an unrelated gesture.

**Kept deliberately, because they were paid for once already:**

- The repeat-call backstop. Rekeyed on the verdict, not the subject string —
  the model says "golden retriever" and "a dog, golden retriever" across two
  calls and those are the same answer.
- The "every scan is independent" clause. It exists because withholding a
  repeat call was a real failure mode.
- The refusal vocabulary — "stabilize", "inadequate lighting", "unclear".
  `scan_accuracy.py` matches `REFUSAL_MARKERS` against spoken text to tell a
  refusal from a wrong answer. Changing those words would break the harness
  silently, which is the worst way for a harness to break.

The classification line worth arguing about later: **a wolf is not a dog, and
neither is a plush one.** That is a choice, not a fact, and it is the choice
that makes the eval interesting rather than a formality.

Partial progress on #11: `get_model_id()` no longer names a preview model
anywhere in the tree. It reads `MODEL_ID` and otherwise falls back to
`gemini-2.5-flash`.

**Amendment, caught within the hour.** That classification rule shipped with a
bug that would have killed the demo: "a photograph of a photograph is NOT a
dog." But the entire interaction is holding a picture up to a webcam, so every
single scan is a re-displayed image — an obedient model would have answered NOT
A DOG to everything, forever. The rule now judges the subject depicted rather
than the medium carrying it, and names phone screens and paper as the expected
mode of operation so it cannot drift back.

Worth keeping for the post: the bug came from writing the classifier and the
test method in separate sittings, and it surfaced from an offhand question
about testing rather than from any test — because nothing was runnable yet to
catch it.

**Broken on purpose, going into tick 2:** nine files still call `report_digit`
with the old signature — `main.py`, `test_agent.py`, `mock_server.py`,
`scan_accuracy.py`, `telemetry_report.py`, `test_ws_session.py`,
`BiometricLock.jsx`, plus two harnesses. The signature changed shape, so this
is real edits, not a sed. Nothing runs until that lands.

## 2 — the rewire, and two things found by reading

The nine-file rewire landed. `main.py`, `test_agent.py`, `test_ws_session.py`,
`mock_server.py` and the `BiometricLock.jsx` sample trace all speak
`report_verdict(is_dog, confidence, subject)` now. Backend dedup is keyed on
`is_dog`, matching the tool's own repeat window, so the two layers agree on what
"the same answer twice" means.

**35 tests pass, ruff clean.** The suite came through the signature change
without a single assertion needing to be weakened, which is the good kind of
boring.

`scan_accuracy.py` was deliberately left alone. Its ground truth is encoded in
the *filenames* — `hand_{d}.jpg`, digit parsed out of the name, `classify()`
comparing ints — so converting it is the same job as choosing the dog fixture
naming scheme. Doing it before the images exist would be guessing at a
convention twice. It goes with #2.

### Found while reading, not while looking

**A second EAP leak, in a test.** `test_get_model_id_default` asserted the
preview model id as a string literal. A test that hardcodes the thing you are
trying to keep out of the tree is a leak with a green checkmark on it. It now
asserts the GA fallback *and* that the id contains no "preview".

**The fixtures lied last time, and they will lie again.** `main.py` carries a
measured table showing 480x360 as the efficient choice, then defaults to 640x480
anyway — because every fixture had a hand filling the frame, while a real hand
at arm's length occupies a fraction of it and loses the fingers first. The table
was not wrong, it was unrepresentative.

This is a live trap for us: a phone held up to a webcam is *exactly* the
arm's-length case. If every dog fixture is a dog filling the frame, the harness
will report numbers the demo cannot reproduce, and we will believe them. **At
least half the dog fixtures must be framed the way the phone actually presents
them.**

**One comment is now stale.** `main.py` still says the uplink is "~77%
microphone (256 kbit/s of raw PCM that cannot be compressed)" — but the mic
stopped going to the API when `wakeWord.js` landed. The bandwidth argument built
on it needs re-measuring before any of it goes in the post.

## 3 — the scrub, and a gate that caught itself

Task #11 is closed for the repo surface. **86 tracked files, zero naming a
non-public model**, enforced by `scripts/check_no_eap.sh` and wired into both
`make test` and `make deploy`.

What moved:

- Six files hardcoded the model id in shell and YAML — `set_env.sh`, `init.sh`,
  `runadk.sh`, `deploy.sh`, `cloudbuild.yaml`, `test_live_connection.py`. All now
  read `MODEL_ID` from the environment and default to GA. The generated `.env`
  still carries the real id; `.env` is gitignored.
- `CLAUDE.md`, `GEMINI.md` and `.gemini/` are gitignored outright. They are dense
  with Live API notes for an allowlisted model and there is no version of them
  that is both useful and publishable. #8 writes a clean public README instead.
- Comments and prose now name the *class* of model, never the id.

### The leak nobody greps for

The scanner's header renders the live model id at `text-2xl`, pulled straight
from the backend's config frame — deliberately, because it proves which model is
behind the glass rather than saying MISSION ALPHA and meaning nothing.

It is also a leak that no repo scan can catch, because it only exists in
**pixels**. Record the demo with `MODEL_ID` pointed at the preview model and the
id is burned into the video, in the largest text on screen, for the whole run.

The gate covers the tree. The video is a human step: **record with `MODEL_ID`
unset.** That is now the only remaining exposure, and it is worth stating plainly
rather than assuming it will be remembered at 3am on Sunday.

### The gate's first catch was itself

First run failed on `scripts/check_no_eap.sh:17` — its own `PATTERNS` line,
which necessarily contains every string it is looking for. Funny once, an
infinite loop thereafter, so the file is excluded from its own scan.

Then verified in both directions rather than assumed: passes clean on 86 files,
and fails with exit 1 on a planted `leak_probe.txt`. A gate that has only ever
been observed passing has not been observed at all.

Patterns are specific ids, not the bare word "preview" — that appears in `vite
preview` and half of npm's vocabulary, and a gate that cries wolf gets passed
with `--no-verify`.

### Noted, not fixed

`BiometricLock.jsx` still carries the finger build's sample trace ("digit 3",
"Three digits.") and a `level_3_complete` PATCH to a participant API from the
way-back-home lab. Neither breaks anything — the PATCH only fires when a
`config.json` that will not exist is present — but both are confusing cruft in a
repo strangers will read. They go with #3.

## 4 — the game comes out, and 35 green tests hid a broken app

The scanner is a scanner now, not a lock. **756 lines down to 583**, frontend
lints clean and builds, 35 backend tests still pass, EAP gate green on 87 files.

### The bug the test suite could not see

The backend started sending `{is_dog, subject, confidence}` in tick 2 and the
tests went green. But `useGeminiSocket.js` was still reading `msg.count ||
msg.digit` off the same frame, so the verdict never reached the UI. **Every test
passed against an app that could not work end to end**, because nothing covers
that seam: the Python suite stops at the socket and there are no frontend tests
at all.

Worth the paragraph in the post. Green tests measured exactly what they cover,
which was not the thing that was broken.

There is a related trap now defused in the same handler: `is_dog` is a boolean,
so the old `msg.count || msg.digit` idiom would have discarded every NOT-A-DOG
verdict — half the answers, and the more interesting half. Every check there is
an explicit `!== undefined` test.

### What came out

- **The 4-digit sequence, the progress dots, the 65-second countdown.** They
  bounded a handshake you could fail; scanning has nothing to fail at. Note the
  cost: that timer was also the thing that eventually closed a billed session,
  so an abandoned tab is now unbounded. The end-session button matters more than
  it did.
- **SUCCESS and FAIL overlays**, and the confetti particles that only they used.
- **A `level_3_complete` PATCH to the way-back-home participant API.** It
  reported progress to a scoreboard belonging to a different project and fired
  on a state that no longer exists.

In their place: a verdict panel that renders DOG or NOT A DOG with the subject
and confidence — on screen as well as spoken, because "WOLF — 71%" is legible in
a recorded demo where a spoken subject is not, and the disagreements are the
part worth seeing.

`bark.js` is wired to the verdict on the same hook `heavyMetalSting.js` uses.
The sound is a synthesised placeholder and frankly a poor one: a bark is a
broadband transient with formant structure, not a chord, which is precisely the
argument for generating the real clips in #4 rather than synthesising them.

### And a bug in yesterday's script

`ingest_fixtures.py --dry-run` created the destination directory before deciding
it was not going to write anything — which is how `tests/fixtures/dogs/` came to
exist while still holding nothing. A dry run that touches the filesystem is not
a dry run. Fixed and verified.

## 5 — one scan path, two triggers

Click-to-scan landed (#6). Frontend lints and builds, 35 backend tests pass, EAP
gate green on 87 files.

The button is rendered **always**, not only where speech recognition is missing.
`wakeWord.js` is Chrome/Edge only, and its fallback streams the microphone — the
path this project already measured at 0/5 — so on Safari or Firefox the "say
SCAN" instruction on screen is a promise the page cannot keep. A judge landing
there needs a control that works, and a presenter in a noisy room wants one
regardless.

### The bug that was one browser away

`ScanScheduler` was constructed *inside* the `micMode === "wake"` branch. So the
button would have had nothing to call on exactly the browsers it exists for —
the scheduler is missing precisely where speech recognition is. Building it
unconditionally cost one line and removed a failure that would only ever have
shown up on someone else's machine.

Both triggers now go through a single `requestScan(source)` in the hook: frames
first, then the request, then one event-log line. The wake word calls the same
function the button does, so the two cannot drift — and the scan-while-speaking
hold behaves identically whichever way you ask.

Also swapped the `?hud=1` sample trace, which still read "digit 3" and "Three
digits." — cosmetic, but it is the panel a reader sees in any screenshot of the
HUD.

### Blocked

**#4 needs an ElevenLabs API key.** Nothing in the environment or `.env`. The
plumbing is done and tested — `bark.js` fires on the verdict — so this is
swapping the synthesised placeholder for generated clips, and the call site does
not change. Until then the scanner barks, badly.

**#2 and #7 still need dog photos.** They are the only things standing between
here and an accuracy number, which is the one piece of evidence the post cannot
be written without.

## 6 — the dogs get out, in nine languages

#5 landed. Frontend lints and builds, 35 tests pass, ruff clean, EAP gate green.

The trigger fires on three or more dogs in one frame, and the scanner says:

> "Alert. Containment has failed. The dogs have been released."

**The multilanguage came free**, which is the good kind of surprise. `main.py`
already tells the model to speak only the selected language for the whole
session, and the model translates its own lines rather than reading a shipped
phrasebook — a deliberate old decision, on the grounds that shipping
translations means shipping strings nobody here can check. So the breach
announcement arrives in whichever of the nine languages is selected without a
single translation in the tree. Pick Japanese and the containment failure is
reported in Japanese.

The instruction also tells it, explicitly, not to sing, not to reference any
song, and not to acknowledge that the line is funny. The joke only works if the
machine does not know it is making one.

### The power chord had to go

The trigger played a distorted E5 — good code, written for a Devil's Horns
easter egg that no longer exists. But a power chord is a joke the interface is
*in on*, and the persona row in the decisions table above says the opposite. So
the breach now gets `playContainmentAlarm()`: two alternating square tones
through a lowpass, the pattern every evacuation alarm uses. Flat, institutional,
and much funnier under a red CONTAINMENT BREACH card than a guitar would be.

`heavyMetalSting.js` is deleted rather than left orphaned. Two comments pointed
at it for the licensing lesson — the archive.org hotlink that 404'd — so those
now state the lesson directly instead of cross-referencing a file that is gone.
A comment that points at a deleted file is worse than no comment.

The socket frame is still `type: "heavy_metal"`. Renaming it would touch the
contract, the mock and the tests for a string no user ever sees.

### Still blocked, and now it is the whole critical path

Unblocked work left: docs (#8) and the fixture portal (#12). Everything else
waits on **dog photos** and an **ElevenLabs key**.

## 7 — the portal, and a 404 that hid its own cause

#12 landed. `/portal.html` serves the fixture set full-bleed to a phone;
`/api/fixtures` lists it. **39 tests pass** (four new), lint, build and ruff
clean, EAP gate green on 88 files.

Plain HTML, not a React route. It has to survive being opened on whatever phone
is in the room, and it must never depend on the SPA bundle building.

### The one rule, and a test that enforces it

**Ground truth is withheld unless explicitly requested.** The portal renders
images into a camera's field of view, so anything the page can show, the model
can read — and a scanner that scores 100% because it read "grey wolf" off the
screen has measured the font.

`reveal=1` is opt-in, the bar hides itself on the next image so it cannot be
left on by accident, and the default payload is asserted not to contain the
words `is_dog`, `subject`, or any subject string *anywhere* in the serialised
response. Asserting on keys alone would pass a response that leaked the answer
under a different name.

The chrome — counter, hint — fades after 1.6s, so the steady state is an image
and nothing else. Tap zones rather than visible buttons, for the same reason.

### The 404 that had been there all along

Vite's dev proxy forwarded `/ws` and nothing else. In production FastAPI serves
the SPA so every path reaches the backend, but in dev Vite is the origin, and
`/api` was answered by Vite — as a 404.

So **`/api/config` has been failing in dev for as long as it has existed.** It
fails soft (`r.ok ? r.json() : null`), so the only symptom was the header
reading AWAITING LINK on the idle screen — which is precisely the bug that
endpoint was written to fix. The graceful fallback hid its own cause, and the
feature looked merely unfinished rather than broken.

Worth the post: the failure was invisible for the same reason it was harmless.

`server.host` is on now too, so a phone on the same network can reach the
portal — with the caveat, written next to it, that this serves a dev build
proxying to a backend holding a live API key.

### The loop is nearly out of work

Unblocked: docs (#8). That is all. Everything else waits on **dog photos** and
an **ElevenLabs key**.

## 8 — the bark stops being a cough

#4 landed. Four clips from the ElevenLabs Sound Effects API, generated by
`scripts/generate_barks.py`, 80KB total. Lint, build, 39 tests, EAP gate green
on 94 files.

**Build time, not run time**, which was the entire argument for using ElevenLabs
here at all. The clips are fetched and decoded once on the first scan and held
in memory; the verdict path touches no network. A streaming voice would have
been a second audio channel on a session that already measured 0/5 with one.

Four clips rather than one: a demo scans a dozen things in a row, and the same
20KB a dozen times stops reading as a dog and starts reading as a UI sound. The
picker never plays the same clip twice running — the repeat is what a listener
notices, much more than which clip it was.

**The synthesised bark stays as a fallback.** A fresh clone with no API key gets
a bad bark instead of a broken app, and `console.warn` explains why. Someone
reading this repo should be able to run it.

### Checked, because four identical file sizes is what a bug looks like

All four clips came back at exactly 20,106 bytes, which is what "the API
returned the same file four times" would also look like. It was constant
bitrate at a fixed 1.2s duration — four distinct MD5s. Thirty seconds to rule
out a silent failure that would have shipped as "why does it always make the
same noise".

### The key

Stored in `.env`, which was confirmed gitignored *before* the secret was written
into it, and verified afterwards: the key appears in no tracked file. It was
pasted in plaintext in chat, so it should be rotated after the challenge
regardless.

## 9 — docs, and a name that will end up in a URL

#8 landed. 39 tests, ruff clean, shell scripts parse, EAP gate green on 94
files. **Every unblocked task is now done.**

`README.md` is rewritten for a stranger rather than for us, and it opens by
crediting the fork — `way-back-home/level_3_new`, the same scanner counting
fingers — because the challenge permits reused open source only when changes are
significant and properly credited, and because it is true.

`CLAUDE.md` and `GEMINI.md` are gitignored, so the README is now the only
project documentation anyone outside this machine will read. It is written on
that assumption.

### The service was still called biometric-scout

Which would have put `biometric-scout-xxxx.run.app` in the Demo section of a
post about a dog scanner. Renamed to `dog-or-not` across `deploy.sh`,
`build.sh`, `cloudbuild.yaml`, `init.sh`, `set_env.sh` and the Makefile, along
with the two `.claude/` skill descriptions, the ruff header, and a
`verify_setup.sh` that still announced itself as "Mission Alpha (Level 3)".

Free to do now because nothing has been deployed yet. It would have been a
migration on Sunday.

### Watching for the photos

A monitor is armed on `tests/fixtures/`, so the accuracy run starts the moment
images land rather than at the next scheduled tick. The loop's heartbeat
stretches out accordingly — there is nothing left for it to do alone.

Remaining: **#2 and #7 need dog photos**, and #9 and #10 follow from them.

## 10 — the machine says woof

The verdict sound changed on a better idea than mine: instead of playing a
sampled bark, **the scanner says "Woof." itself**, deadpan, in whichever of the
nine languages is selected.

It needed no new API. The Live model is already a text-to-speech engine — it has
been speaking every verdict since the first build — so this was one rule in
`agent.py`, not an integration. The instruction names each language's own
convention rather than leaving it to translate: ワンワン, Guau, Ouaf, Wau, 멍멍,
भौं भौं. A transliterated "woof" in Japanese would have been the wrong joke.

Why it is better than the sample: a realistic bark is the app *performing* a
dog. A flat synthetic voice saying "Woof." in the same register it uses for
"Negative. Grey wolf." is a machine *reporting* one, in the only vocabulary that
fits. The instruction is explicit that it is not imitating, not performing, and
must never acknowledge that saying this is funny.

It also runs in Charon — chosen in the first build as the deepest prebuilt
voice, "which suits a cold surveillance system". Nobody picked that voice with
this in mind.

**Untested.** Verifying it needs a billed Live session, and whether the model
actually produces ワンワン rather than a phonetic "woof" is a real open question.
First thing to check when a session runs.

The ElevenLabs pack moved to the containment breach and fires all four clips,
unevenly spaced, under the alarm. That is the one moment sampled barking is
literally correct, and it keeps the category entry honest — the clips do
something no synthesiser here could.

### Green lint, failed build

Deleting the dead synthesiser took `playContainmentAlarm()` out with it, because
it sat below the deleted block. **ESLint passed anyway** — it does not resolve
cross-module imports by default — and the failure only appeared in `vite build`,
whose error was buried under twelve lines of rollup stack trace that scrolled
past the tail of the log.

That is the second time this build has produced a green check over broken code,
after the tests that passed against a UI reading a field the backend had stopped
sending. Different tools, same shape: **each one measured exactly what it
covers, and the gap between them is where things break.** Worth a paragraph in
the post — it is the most honest argument for running the build, not just the
linter, on every tick.

### The cost question, answered with numbers

Asked what is actually cheap here, the ranking is not what it looks like:

| | Cost |
|---|---|
| Video uplink | ~128 kbit/s **continuously**, every second a session is open |
| Spoken "Woof." | ~19 KB per scan (0.4s of 24kHz PCM) |
| Bark pack | 80 KB **once**, then never again |
| The Live session itself | billed per second, busy or idle |

The spoken verdict is not the expense. One word is 19KB. The earlier bandwidth
argument was about *continuous* audio — the microphone, 256 kbit/s, already
fixed — and it does not transfer to a single syllable.

**The expense is a session nobody is using**, and that is a regression this
build introduced: removing the 65-second round timer in tick 4 also removed the
only thing that ever closed one. An abandoned tab was streaming video until the
browser closed.

Added `IDLE_TIMEOUT_S` (default 180s) and an idle reaper. Keyed on the last
**scan request**, not the last frame — the camera uploads continuously, so
`last_input_time` never goes stale and a reaper watching it would never fire.
Generous on purpose: someone talking through a demo can go three minutes between
scans, and closing under a presenter costs more than the bandwidth saves.

Two mistakes on the way in, both caught by tooling: the patch put a stray
unindented assignment inside the receive loop, and used `contextlib.suppress`
without importing `contextlib`.

### A comment that had quietly inverted

`main.py` advised "do not trade video resolution for bandwidth — the uplink is
~77% microphone, so the savings are in the audio gate, not here."

The audio gate was taken. The microphone stays in the browser now, so **video is
essentially the entire uplink** and that advice now points the wrong way. The
comment argued against the only lever still available, on the strength of a
saving that had already been banked.

Corrected — but corrected into an open question, not a new default. The
resolution table was measured on fixtures where the subject filled the frame,
and a dog held up on a phone does not. That is exactly what the accuracy matrix
should settle once the photos land.

## 11 — the harness stops counting fingers

`scan_accuracy.py` is converted. It was the last finger-shaped thing in the
tree, deferred in tick 2 on the grounds that its ground truth *is* the fixture
naming scheme — and `ingest_fixtures.py` has since settled that, so the coupling
resolved itself.

Ground truth now comes from the directory and filename (`dogs/dog_*.jpg` →
is_dog=True), with `fixtures.json` supplying the optional subject hint. One
place the expected answer lives, and it is the same place the ingest script
writes it.

Taken off the critical path deliberately: when the photos land, the harness runs
rather than needing a conversion first.

### Five outcomes, not two

A binary verdict scored as a hit rate hides the half that matters. Trials now
score as:

| | |
|---|---|
| `hit` | right |
| `false_dog` | called a wolf, plush or statue a dog |
| `false_notdog` | refused an actual dog |
| `refused` | declined — lighting, blur, "unclear" |
| `silent` | no call, nothing said |

**The two failures are not the same failure.** A scanner that barks at a bronze
statue is funny and on-brand; one that refuses somebody's actual dog is broken.
Collapsing both into "wrong" would have produced a number that could not tell
the demo-ruining case from the demo-making one.

The model's own `subject` string is recorded beside the truth for the same
reason: "said husky, was grey wolf" is the finding. A bare wrong count is not.

### Confirmed working

Runs `--help`, parses, ruff clean, 39 tests still pass — and with no fixtures it
exits with `run ./scripts/ingest_fixtures.py first` rather than a traceback,
which is the state it will be found in by anyone cloning this before the photos
exist.

Everything on the critical path is now built. Nothing on it has been run.

## 12 — it runs

With nothing left to build, the useful thing was to attack the risk from the
last status: **everything was verified by tests, linters and a build, and none
of those had ever started the app.**

So the mock backend was started for real and driven with a WebSocket client. It
works, and the frame it emits matches — field for field — what
`useGeminiSocket.js` reads:

    {"type":"match","is_dog":true,"subject":"golden retriever","confidence":92}

`is_dog` arrives as a JSON boolean, which is the detail the old `msg.count ||
msg.digit` idiom would have silently discarded on every NOT-A-DOG. First
end-to-end confirmation of the contract that broke in tick 4.

`portal.html`, `barks.json` and the MP3s all serve over HTTP: 200, and the bark
manifest comes back byte-for-byte.

### And the third instance of the same bug

**The mock server had no `/api/config` and no `/api/fixtures`.** So the fixture
portal — the thing built specifically so a phone can drive the demo — could not
load a single image under `./mock.sh`, which is the documented way to work on
the UI without billing a session. It said "Could not reach /api/fixtures" and
the header said AWAITING LINK.

That is the same failure as tick 7's Vite proxy, which was itself the same
failure as `/api/config` never having worked in dev: **a route that exists in
the real backend and not in the place people actually develop.** All three
failed soft. Nothing crashed, nothing logged, the features just looked
unfinished.

Both routes added to the mock, with the same withhold-ground-truth contract —
the portal's one rule has to hold in mock mode most of all, since that is where
it will mostly be used.

### The test that stops the fourth one

`tests/test_mock_parity.py` compares the real app's `/api/*` routes against the
mock's and fails naming the difference. Plus key-level parity on the config
payload, so a new field is caught too.

Then checked that the test is not vacuous — two empty sets compare equal, and a
parity test over nothing passes forever. Both apps report
`{/api/config, /api/fixtures}`, and adding a route to only the real app makes it
fail, as it should.

43 tests now, ruff clean, EAP gate green on 95 files.

### Ordinary friction, recorded because the log is the honest one

`pkill -f mock_server.py` matched this shell's own command line and killed the
tick. Twice. Third attempt read `/proc` directly and compared PIDs. The shell
still exited oddly, but the server did die and port 8080 is closed.

## 13 — it works, and the first numbers

The scanner has now looked at dogs. **Twenty fixtures, zero wrong verdicts.**

| outcome | n | |
|---|---|---|
| correct verdict | 17 | wolves, coyotes, foxes, two bronze statues, six breeds |
| containment breach | 1 | `dog_02`, correctly — see below |
| cat alarm | 2 | both cats triggered the system error, as designed |
| **false_dog** | **0** | never called a wolf, fox, statue or plush a dog |
| **false_notdog** | **0** | never refused a real dog |

Latency 0.68–1.56s, mostly ~0.7s. One flake: `dog_05` went silent once and
answered correctly on retry.

### The blockers were not what I had been saying they were

For four hours the loop reported "waiting on dog photos". Two things were wrong
with that:

1. **There was no `GOOGLE_API_KEY`.** Never checked. The accuracy run was never
   one photo away — it was one photo *and* a credential away, and only one of
   those had been named.
2. **The photos were a soft blocker.** Twenty CC/public-domain fixtures came
   from Wikimedia Commons in about ten minutes, with `ATTRIBUTION.md` generated
   from the licence metadata. That could have happened at any point.

Recorded because the log is supposed to be the honest one: the loop optimised
what it could reach instead of what mattered, and reported a blocker it had not
verified.

### The GA model cannot call tools

`gemini-2.5-flash` does not support `bidiGenerateContent` at all — the fallback
inherited from the finger build was a model that cannot run this app, under a
comment claiming it could. Nothing caught it because nothing had ever opened a
session.

Exactly one non-preview model offers the Live API: `gemini-2.5-flash-native-audio-latest`.
On it, every trial came back SILENT — while the model's own thinking said:

> *"A visual identification scan reveals a clear image of a Golden Retriever...
> I'm executing the `report_verdict` tool with the dog's details."*

It sees the dog, narrates the call, and emits nothing. **0 tool calls, ever.**
The whole architecture hangs off that call, so on GA the app is decorative.
Target is the 3.1 Live preview model, by decision; the tree's default stays GA
and the id stays in `.env`.

### One in twenty fixtures was poisoned

`notdog_08` — "Dog with Goofy plush toy" — is a **real dog chewing a toy**,
filed as not-a-dog. It would have scored every correct answer as a failure.
Caught by looking at it, which is the only way it could have been caught.

Nine of twenty verified by eye so far. The lesson is old and was written down in
this project already: *generate the input, never the expectation.*

### The harness scored correct behaviour as failure

`dog_02` came back SILENT twice. It is a Halloween dog park — beagle, cavalier,
retriever — and the model called `trigger_heavy_metal_mode()`. **The containment
breach fired on an unposed real-world photograph, unprompted.**

But the harness only scored `report_verdict`, so both easter eggs — cat alarm
and breach — read as silence. The instruction gives them *absolute priority*
over `report_verdict`, which means the harness was marking obedience as failure.
Now scored as `CAT-ALARM` and `BREACH`. `dog_02` reads BREACH.

### Confidence is a useless field

Every single call came back `confidence: 100`. Twenty-seven of them. Wolf,
statue, retriever, all 100. The field is displayed in the UI and it means
nothing — worth saying out loud in the post rather than presenting it as signal.

## 14 — the post

Drafted `posts/submission.md` from this log. Two placeholders remain — the demo
URL and the repo embed — because both need outward-facing actions that have not
been taken: nothing is deployed and there is no git remote.

The through-line the log handed me, which I did not expect and did not go
looking for:

> **Every green checkmark in this project was, at some point, green over
> something broken.**

35 passing tests over an app whose frontend read a field the backend had stopped
sending. Clean ESLint over a build that failed on a missing export. A gate that
kept a non-public model id out of the repo, and a test that asserted that id as
a string literal. The same gate failing on its own pattern list. Three separate
instances of a route existing in the real backend and not where anyone develops
— every one failing soft, so the feature merely looked unfinished. A model that
narrates calling a tool and emits nothing. A poisoned fixture no test could
catch. A harness scoring obedience as failure.

That is a better post than "I built a dog scanner", and none of it was
available in advance. It came out of writing down what broke, tick by tick,
while it was still true.

Also recorded in the post: the loop reported the wrong blocker for four hours.
Leaving that in.

### Deploy is possible but not taken

`gcloud` is authenticated on an active project, so `make deploy` would work. Not
run: it creates a public, billed Cloud Run service. Same for pushing the repo —
there is no remote, and creating a public one is not a decision to make
unattended. Both wait on a word.

## 15 — finishing the eye audit

Sixteen of twenty fixtures now verified by looking at them. **No further
mislabels** beyond the plush-toy one already caught. The remaining four
(`dog_06`, `notdog_04`, `notdog_07`, `notdog_10`) have a partial cross-check:
the model's own `subject` string agreed with the intended label in every case —
"german shepherd", "coyote", "grey wolf", "red fox". That is corroboration, not
proof, and it is stated that way.

What the audit turned up about the set itself:

- `dog_01` is a beagle **behind cage bars**, and the model read it correctly
  through the occlusion.
- `notdog_06` is the hardest image in the set by some distance: a wolf lying in
  shade, behind bare branches and a chain-link fence, filling maybe a tenth of
  the frame. Called `grey wolf`, correctly.
- `dog_02` remains the interesting one — a Halloween dog park that is a
  *breach* fixture, not a verdict fixture, and the only reason anyone knows
  that is that someone looked at it.

The audit did not change any number in the post. That is the outcome to want
from an audit and it is worth recording precisely because it is unexciting: the
value was in the one it caught earlier, and the confidence that there is not a
second one.

### Coverage, honestly

Four fixtures rest on model agreement rather than human inspection. If a number
in the post ever needs defending, those four are where to look first.
