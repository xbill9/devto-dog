---
title: I built a security scanner that checks if you are a dog
published: false
description: A live-video scanner that barks when it sees a dog, built by a self-paced AI loop over one weekend. Every green checkmark in this project was, at some point, green over something broken.
tags: devchallenge, weekendchallenge, ai, testing
cover_image:
---

*This is a submission for [Weekend Challenge: Dog Days Edition](https://dev.to/challenges/weekend-2026-08-13)*

## What I Built

I went looking for a dog in the GPU family tree. I found fish, dead physicists, and a bridge in Florence.

NVIDIA names its architectures after scientists — Tesla, Kepler, Hopper, Blackwell. AMD names its GPUs after *fish*: Sienna Cichlid, Navy Flounder, Hotpink Bonefish. Intel uses Italian bridges. There is exactly one dog in the entire lineage: **Husky**, the CPU cores in AMD's 2011 Llano APU. And because Llano was an APU, those Husky cores shared a die with an integrated Radeon — codenamed **Sumo**. The closest a dog has ever gotten to a GPU is sitting next to one, and even then the graphics half got named after a wrestler.

So I put one there myself.

**Dog or Not** is a live-video security scanner with one job. You hold something up to the camera, say **"scan"**, and it tells you whether it is a dog. If it is, it barks.

It is deliberately not charming about it. The scanner is a cold threat-assessment system that happens to have been pointed at dogs, and the entire joke is that it does not know it is making one. Hold up a golden retriever and it says, in the flattest voice available:

> **"Woof."**

Hold up a wolf and it says *"Negative. Grey wolf."* Hold up a cat and it suffers a fatal system error. Get three dogs in frame and it declares a **containment breach** — in whichever of nine languages you picked.

The classification line is where it gets interesting. A wolf is not a dog. Neither is a coyote, a fox, a plush toy, a bronze statue, a cartoon, or a person in a costume. That is a choice rather than a fact, and it is the choice that makes the thing measurable — "is this a dog" is otherwise solved zero-shot and there is nothing to find out.

## Demo

**Live:** https://dog-or-not-289270257791.us-central1.run.app

<!-- PASTE_VIDEO_HERE — record with a phone held up to the webcam; the fixture
     portal at /portal.html cycles the eval set. -->

Grant camera access, press INITIATE, then hold something up and say **"scan"**.
Chrome or Edge for the voice command — everywhere else, use the SCAN button,
which does exactly the same thing.

## Code

{% embed https://github.com/xbill9/devto-dog %}

Forked from [way-back-home](https://github.com/xbill9/way-back-home), which was the same scanner counting fingers for a biometric handshake. The multimodal plumbing came from there — bidirectional WebSocket, 1 FPS video, local wake-word detection, the accuracy harness, the Cloud Run chain — and it is the reason this exists at all in a weekend.

## How I Built It

I did not write this. A self-paced loop did, and I want to talk about what that was actually like — because the interesting part is not that it worked.

**Loop-driven development**, concretely: instead of a conversation, the agent schedules its own next wake-up. It reads a build log, picks the highest-priority unblocked task, does it, and appends an honest entry about what moved and what broke. Then it decides when to come back — fifteen minutes while there was work, thirty once it ran out — and arms a file watcher so it wakes immediately if the thing it is waiting on arrives.

That build log is in the repo, tick by tick, written as it happened rather than reconstructed afterwards. This section is drawn from it.

### Every green checkmark was, at some point, green over something broken

This is the thing I did not expect, and it is the whole reason the post is worth reading.

**35 passing tests over an app that could not work.** The backend started sending `{is_dog, subject, confidence}`. The tests went green. The frontend was still reading `msg.count || msg.digit` off that same frame, so the verdict never reached the UI. Nothing covers that seam — the Python suite stops at the socket and there were no frontend tests at all. The tests measured exactly what they cover, which was not the broken part.

There was a nastier bug hiding in the same line. `is_dog` is a *boolean*, so the old `msg.count || ...` idiom would have silently discarded every NOT-A-DOG verdict — half the answers, and the more interesting half.

**Clean lint over a failed build.** Deleting a dead function took a live one out with it, four lines below. ESLint passed — it does not resolve cross-module imports by default — and the failure only appeared in `vite build`, buried under twelve lines of rollup stack trace.

**A green test asserting the exact thing it was supposed to prevent.** The project keeps a non-public model id out of the repo, enforced by a gate wired into `make test` and `make deploy`. One test asserted that id as a string literal. A leak with a checkmark on it.

**A gate that caught itself.** That same gate failed on its first run — on its own list of patterns, which necessarily contains every string it searches for. Funny once, an infinite loop thereafter.

### The same bug, three times, in three places

A route that exists in the real backend and not in the place people actually develop:

1. `/api/config` 404ing under the Vite dev proxy, which forwarded only `/ws`. Symptom: the header read AWAITING LINK — *the exact bug that endpoint was written to fix.*
2. `/api/config` and `/api/fixtures` missing from the mock server — the documented way to work on the UI without billing a session. The fixture portal could not load a single image there.
3. Waiting to happen on the next endpoint.

Every one failed **soft**. Nothing crashed, nothing logged an error, and the feature just looked unfinished. The graceful fallback hid its own cause. There is now a test that diffs the real app's `/api/*` routes against the mock's and fails naming the difference — and I checked it is not vacuous, because two empty sets compare equal and a parity test over nothing passes forever.

### The model that narrates calling a tool and then doesn't

The whole architecture hangs off one tool call: the model sees a subject, calls `report_verdict(is_dog, confidence, subject)`, and everything downstream — UI, bark, scoring — follows from that.

Exactly one non-preview model offers the Live API. On it, every single trial came back SILENT. Meanwhile its own thinking said:

> *"A visual identification scan reveals a clear image of a Golden Retriever. The subject is verified as a real dog with 95% confidence, as `is_dog` is true... I'm executing the `report_verdict` tool with the dog's details, then I will say 'Woof.'"*

It sees the dog. It narrates the call. **Zero tool calls, ever.** Meanwhile the fallback model inherited from the earlier build could not open a Live session at all, under a comment claiming it could — because until the first real session, nothing had ever opened one.

### One fixture in twenty was poisoned

The eval set came from Wikimedia Commons, sourced by search term. One of them — "Dog with Goofy plush toy" — is a **real dog chewing a toy**, filed as not-a-dog. It would have scored every correct answer as a failure.

There is no test for that. The only way to catch it is to look at it. The project's own older documentation already says so: *generate the input, never the expectation.*

### And the harness was scoring obedience as failure

One dog fixture came back SILENT twice, consistently. It is a Halloween dog park — beagle, cavalier, retriever in the background — and the model had called `trigger_heavy_metal_mode()`. **The containment breach fired unprompted, on an unposed real-world photograph.**

The harness only scored `report_verdict`. But the instruction gives the easter eggs *absolute priority* over `report_verdict` — so the harness was marking the model doing exactly as it was told as a failure.

### The numbers

Twenty fixtures, one session each:

| outcome | n | |
|---|---|---|
| correct verdict | 17 | six breeds, wolves, coyotes, foxes, two bronze statues |
| containment breach | 1 | correct — three dogs in frame |
| cat alarm | 2 | both cats triggered the system error |
| **called a non-dog a dog** | **0** | |
| **refused a real dog** | **0** | |

Latency 0.68–1.56s, mostly around 0.7. It correctly said *"bronze statue"* for a sculpture of a man with a bronze dog beside him.

**And one honest caveat: confidence is meaningless.** All 27 calls came back `confidence: 100`. Wolf, statue, retriever — 100 every time. It is rendered in the UI and it is noise.

### What the loop got wrong

It reported the wrong blocker for four hours. It kept saying it was waiting on dog photos, while (a) there was no API key, which it had never checked, and (b) twenty public-domain fixtures with generated attribution turned out to be about ten minutes of work.

It optimised what it could reach instead of what mattered, and reported a blocker it had not verified. That is a very human failure mode and it is worth naming, because the honest version of "I let an AI build this over a weekend" includes it.

## Prize Categories

**Best Use of Google AI** — Gemini Live via the Agent Development Kit. Bidirectional WebSocket streaming video at 1 FPS, structured verdicts through tool calls rather than parsed prose, and a nine-language session config where the model translates its own lines rather than reading a shipped phrasebook. That last part is the cheapest possible proof the model is really being called: a recording cannot answer in Japanese.

**Best Use of ElevenLabs** — the bark pack, generated with the Sound Effects API at **build time**, never at runtime. The clips are fetched and decoded once and held in memory, so the bark adds zero latency to the response path and cannot fail during a session. This project had already measured what a second audio stream does to a Live session — 0/5 against 5/5 — and the way to use a sound API here was to make the app touch the network *less*, not more.

Sound effects generated with [ElevenLabs](https://elevenlabs.io). Fixture images from Wikimedia Commons, attributed in the repo.

<!-- Thanks for participating! -->
