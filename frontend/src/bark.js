/**
 * The bark pack, played locally on a containment breach.
 *
 * A single verdict plays NO sample. The scanner speaks its own confirmation --
 * "Woof.", in whichever of the nine languages is selected, in the same flat
 * voice it uses for a wolf -- and a realistic bark over the top would turn a
 * machine reporting a dog into an app impersonating one. The breach is the one
 * moment three or more dogs are loose and sampled barking is literally correct.
 *
 * Four clips generated at build time with the ElevenLabs Sound Effects API
 * (scripts/generate_barks.py), decoded once on the first scan and held in
 * memory. Nothing here touches the network at verdict time, so the bark adds no
 * latency to the response path and cannot fail in a way that affects a session.
 * That was the whole argument for using ElevenLabs at build time rather than as
 * a streaming voice: this project already measured what a second audio stream
 * does to a Live session, and it was 0/5.
 *
 * Four rather than one because they play together, and four copies of one
 * sample is a delay line rather than a pack.
 *
 * With no audio pack -- a fresh clone before `generate_barks.py` has run -- the
 * breach still gets its alarm, which is synthesised and always works. Missing
 * barks degrade to a quieter breach, never a broken one.
 *
 * Sound effects generated with ElevenLabs (elevenlabs.io).
 */

let ctx = null;

function getCtx() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    // One context for the page. AudioStreamer leaked one per render once and
    // Chrome refused to make more after about six; see useGeminiSocket.js.
    ctx ??= new Ctx();
    return ctx;
}

// Decoded clips, loaded once. `null` until the first attempt; an empty array
// means the pack is genuinely absent and the fallback is in use.
let pack = null;
let packLoading = null;

async function loadPack(ac) {
    if (pack) return pack;
    packLoading ??= (async () => {
        try {
            const manifest = await fetch('/audio/barks.json');
            if (!manifest.ok) throw new Error(`barks.json ${manifest.status}`);
            const { clips } = await manifest.json();
            pack = await Promise.all(
                clips.map(async (url) => {
                    const r = await fetch(url);
                    if (!r.ok) throw new Error(`${url} ${r.status}`);
                    return ac.decodeAudioData(await r.arrayBuffer());
                }),
            );
        } catch (e) {
            // Not worth surfacing: the synthesised fallback covers it.
            console.warn('[bark] no audio pack, synthesising instead:', e.message);
            pack = [];
        }
        return pack;
    })();
    return packLoading;
}

/**
 * The whole pack at once, staggered — for the containment breach.
 *
 * A single verdict does NOT play a bark: the scanner says "Woof." itself, in
 * whichever language it is speaking, and a realistic bark on top would be the
 * app performing a dog over the top of a machine reporting one. The joke is the
 * flat delivery, and it only works alone.
 *
 * The breach is the one moment real barking is literally correct — three or
 * more dogs are loose — so this is where the generated clips earn their place.
 * All four, overlapping, under the alarm.
 */
export async function playPack() {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') await ac.resume();

    const clips = await loadPack(ac);
    if (!clips.length) return; // the synthesised fallback is not worth four of

    const now = ac.currentTime;
    clips.forEach((buf, i) => {
        const src = ac.createBufferSource();
        src.buffer = buf;
        const gain = ac.createGain();
        gain.gain.value = 0.85;
        src.connect(gain).connect(ac.destination);
        // Uneven spacing: four barks on a grid sounds like a drum machine.
        src.start(now + i * 0.31 + (i % 2) * 0.12);
    });
}

/**
 * Two-tone containment klaxon, for the breach.
 *
 * This replaces a distorted power chord carried over from the finger build's
 * Devil's Horns easter egg, which no longer exists. A power chord is a joke the
 * interface is in on; the whole premise here is a machine that does not know it
 * is funny -- see the persona row in BUILD-LOG.md -- so the breach gets an
 * alarm, flat and institutional, and the audience supplies the rest.
 *
 * Synthesised, not sampled, which is why it is the part that always works: a
 * clone with no audio pack still gets its alarm.
 *
 * Square-ish alternating tones, the pattern every evacuation alarm uses.
 */
export async function playContainmentAlarm() {
    const ac = getCtx();
    if (!ac) return;
    if (ac.state === 'suspended') await ac.resume();

    const now = ac.currentTime;
    const TONES = [620, 440];
    const BEAT = 0.42;
    const CYCLES = 3;

    for (let i = 0; i < CYCLES * TONES.length; i++) {
        const at = now + i * BEAT;
        const osc = ac.createOscillator();
        osc.type = 'square';
        osc.frequency.value = TONES[i % TONES.length];

        // A square wave straight to the destination is harsh enough to clip on
        // laptop speakers; the lowpass takes the top off without softening the
        // attack, which is the part that reads as "alarm".
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;

        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        gain.gain.setValueAtTime(0.22, at + BEAT - 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + BEAT - 0.01);

        osc.connect(lp).connect(gain).connect(ac.destination);
        osc.start(at);
        osc.stop(at + BEAT);
    }
}
