import React, { useState, useEffect, useRef } from 'react';
import { useGeminiSocket } from './useGeminiSocket';
import { playPack, playContainmentAlarm } from './bark';
import { Telemetry } from './Telemetry';
import { EventTrace } from './EventTrace';
import { SessionReview } from './SessionReview';


// Representative values for ?hud=1, so the panels can be laid out and checked
// without a webcam or a billed session. Deliberately the awkward cases: a long
// modality breakdown, four-digit token counts, a three-digit latency.
const SAMPLE_METRICS = {
    upKbps: 128.6, videoKbps: 128.6, audioKbps: 0, downKbps: 83.2,
    fps: 1.0, netMs: 12, detectMs: 840, speakMs: 310,
    micOpen: false, micGated: false, micMode: 'wake',
    upHistory: [120, 180, 333, 300, 210, 333, 290, 333, 310, 333],
    downHistory: [10, 60, 83, 40, 90, 83, 20, 75, 83, 60],
    contextTokens: 3786, outputTokens: 1204,
    tokensByModality: { TEXT: 1728, IMAGE: 1386, AUDIO: 138 },
    gateLevel: 0.0042, gateOpensAt: 0.0126,
};
const SAMPLE_EPOCH = 1786650000000;
const SAMPLE_SAMPLES = Array.from({ length: 90 }, (_, i) => {
    const talking = (i > 25 && i < 40) || (i > 60 && i < 72);
    return {
        t: SAMPLE_EPOCH + i * 1000,
        up: 128 + (talking ? 205 : 0), down: 20 + (talking ? 70 : 0),
        video: 128, audio: talking ? 205 : 0,
        fps: i < 75 ? 1 : 0.4,
        netMs: 12, detectMs: talking ? 700 + (i % 7) * 90 : null,
        speakMs: talking ? 320 : null,
        contextTokens: 400 + i * 40, outputTokens: i * 9,
        tokensByModality: { TEXT: 300 + i * 16, IMAGE: 80 + i * 22, AUDIO: 20 + i * 2 },
    };
});
const SAMPLE_EVENTS = [
    { t: SAMPLE_EPOCH + 82000, kind: 'scanner', text: 'Scanner Online.' },
    { t: SAMPLE_EPOCH + 85000, kind: 'you', text: '"scan" \u2192 2 frames + scan' },
    { t: SAMPLE_EPOCH + 85800, kind: 'tool', text: 'report_verdict({"is_dog":true,"subject":"golden retriever"})' },
    { t: SAMPLE_EPOCH + 85900, kind: 'match', text: 'dog \u2014 golden retriever' },
    // "Woof." -- what the scanner actually says on a dog (agent.py rule 6). The
    // sample used to read "Canine confirmed.", a line no build has ever spoken.
    { t: SAMPLE_EPOCH + 87000, kind: 'scanner', text: 'Woof.' },
    { t: SAMPLE_EPOCH + 89000, kind: 'mic', text: 'gated' },
];

// The idle screen's only piece of identity. A targeting reticle with a dog
// inside it, because "Canine Verification Interrogator" is the joke and the
// screen should be in on it before anyone presses a button -- until now the
// idle state was a select and a button on black, indistinguishable from the
// finger build it grew out of. Inline SVG rather than an asset: the deployed
// page runs under a strict CSP and the last hotlinked graphic in this project
// 404'd silently.
function ScannerReticle({ className = '' }) {
    return (
        <svg viewBox="0 0 120 120" className={className} aria-hidden="true" fill="none">
            {/* Reticle ring + corner ticks */}
            <circle cx="60" cy="60" r="54" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
            <circle cx="60" cy="60" r="44" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1" strokeDasharray="6 10" />
            <path d="M60 2v14M60 104v14M2 60h14M104 60h14" stroke="currentColor" strokeOpacity="0.7" strokeWidth="2" />
            {/* Dog head, as a silhouette -- at 9rem a detailed breed reads as
                noise. Built from ellipses rather than one clever path, because
                the first attempt was a single hand-authored path and it
                rendered a cat: upright triangular ears, round face, no muzzle.
                A cat is this app's *failure* state, so the mark has to be
                unmistakable. Drop ears and a protruding muzzle are what carry
                that; ears drawn first so the skull overlaps their tops. */}
            <g transform="translate(60 58)" fill="currentColor">
                <ellipse cx="-20" cy="2" rx="8" ry="19" />
                <ellipse cx="20" cy="2" rx="8" ry="19" />
                <ellipse cx="0" cy="-5" rx="19" ry="16" />
                <ellipse cx="0" cy="12" rx="13" ry="10" />
                <circle cx="-8" cy="-7" r="3" fill="#000" />
                <circle cx="8" cy="-7" r="3" fill="#000" />
                <ellipse cx="0" cy="8" rx="5" ry="3.8" fill="#000" />
            </g>
        </svg>
    );
}

// The scanning screen's dog mark. Same lesson as the reticle above: four toes
// and a pad from plain ellipses, not one clever path -- at 2rem the silhouette
// is all that survives, and a paw is only legible as "four small shapes over
// one big one". `barred` struck through is the NOT-A-DOG variant, so the two
// verdicts differ in shape and not only in colour (the screen is filmed, and
// red/green alone is the one distinction a colourblind viewer loses).
function PawPrint({ className = '', barred = false }) {
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
            <g fill="currentColor">
                <ellipse cx="18" cy="46" rx="10" ry="13" transform="rotate(-20 18 46)" />
                <ellipse cx="38" cy="29" rx="10.5" ry="14" transform="rotate(-8 38 29)" />
                <ellipse cx="62" cy="29" rx="10.5" ry="14" transform="rotate(8 62 29)" />
                <ellipse cx="82" cy="46" rx="10" ry="13" transform="rotate(20 82 46)" />
                <ellipse cx="50" cy="72" rx="24" ry="19" />
            </g>
            {barred && (
                <>
                    {/* Cut a gap first, or a same-coloured bar over a
                        same-coloured paw is invisible. Black, because every
                        surface this sits on is the page's black. */}
                    <path d="M10 90 L90 10" stroke="#000" strokeWidth="17" strokeLinecap="round" />
                    <path d="M10 90 L90 10" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
                </>
            )}
        </svg>
    );
}

export default function DogScanner() {
    // No sequence, no countdown, no win condition. The finger build was a lock
    // you had to open in 65 seconds; this is a scanner you hold things up to
    // until you get bored, so SCANNING is a resting state rather than a round.
    const [status, setStatus] = useState('IDLE'); // IDLE, SCANNING, SYSTEM_ERROR, HEAVY_METAL
    const [verdict, setVerdict] = useState(null); // { isDog, subject, confidence, at }


    const videoRef = useRef(null);
    // The socket callbacks are created once and would otherwise close over the
    // status from that render; a ref always reads the current one.
    const statusRef = useRef(status);
    useEffect(() => { statusRef.current = status; }, [status]);
    // Dropped sessions survived per round, not per page.
    const dropCount = useRef(0);
    // ADK backend expects /ws/{user_id}/{session_id}
    //
    // Fresh session per ROUND, not per mount. The component stays mounted across
    // rounds, so a per-mount id meant every round after the first reconnected
    // with the same session_id -- and the Runner's auto_create_session=True
    // *resumes* an existing session rather than creating one. The model then
    // carried the previous round's conversation into the new one: round 2 opened
    // mid-scan with "Five digits." instead of "Scanner Online.", and by round 3
    // it answered once and went silent for the rest of the session.
    //
    // crypto.randomUUID() rather than Math.random().toString(36).substring(7),
    // which yielded about five base-36 characters -- collidable across
    // concurrent users, who all share the hardcoded "user1".
    const [sessionId, setSessionId] = useState(() => crypto.randomUUID());

    // Language is a per-session choice, and the strongest evidence in the demo
    // that a model is really being called: a recording cannot answer in
    // Spanish. It has to be known before the socket opens, because speech_config
    // is part of the Live connect config and cannot change mid-session.
    const [languages, setLanguages] = useState({ 'en-US': 'English' });
    const [language, setLanguage] = useState('en-US');

    // Dynamic WebSocket URL handling for Cloud Shell / Localhost
    // If protocol is https (Cloud Shell), use wss. If http (localhost), use ws.
    // window.location.host includes the port if present.
    // Layout of the telemetry panels can be checked without a session, and
    // without a webcam or a billed connection, via ?hud=1.
    //
    // `?hud` also selects WHICH screen to lay out, because the scanning screen
    // needs a camera, a granted permission and a billed session to reach --
    // which is exactly the reason its layout had never been checked, and why a
    // paw print in the footer silently wrapped "CONTINUOUS SURVEILLANCE" onto
    // two lines. `1` is the idle screen as before; `scan`, `dog` and `notdog`
    // are the three states of the centre panel. Preview only: no socket, no
    // camera, and the real screens are untouched.
    const hudParam = new URLSearchParams(window.location.search).get('hud');
    const forceHud = hudParam !== null;
    const previewScreen = ['scan', 'dog', 'notdog'].includes(hudParam) ? hudParam : null;
    const previewVerdict = previewScreen === 'dog'
        ? { isDog: true, subject: 'golden retriever', confidence: 94 }
        : previewScreen === 'notdog'
            ? { isDog: false, subject: 'grey wolf', confidence: 71 }
            : null;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const buildWsUrl = (id) =>
        `${protocol}//${window.location.host}/ws/user1/${id}?lang=${encodeURIComponent(language)}`;
    const wsUrl = buildWsUrl(sessionId);

    const { status: socketStatus, isMock, config, metrics, events, sessionSamples, saveSession, clearSession, connect, disconnect, startStream, stopStream, requestScan } = useGeminiSocket(wsUrl, {
        onVerdict: (v) => {
            if (statusRef.current !== 'SCANNING') return;
            setVerdict({ ...v, at: Date.now() });
            // No sound here on purpose. The scanner speaks its own confirmation
            // -- "Woof.", in whichever of the nine languages is selected, in the
            // same flat voice it reads out a wolf -- and layering a sampled bark
            // over that would turn a machine reporting a dog into an app
            // impersonating one. See agent.py rule 6.
        },
        onSystemError: (message) => {
            console.error('SYSTEM ERROR:', message);
            setStatus('SYSTEM_ERROR');
        },
        // A dropped session should not end the round. Bounded, because if the
        // API is rejecting something we send, reconnecting forever just repeats
        // it -- and each attempt is a new billed session.
        onDropped: () => {
            if (statusRef.current !== 'SCANNING') return;
            if (dropCount.current >= 3) {
                console.error('[DogScanner] giving up after 3 dropped sessions');
                return;
            }
            dropCount.current += 1;
            const freshId = crypto.randomUUID();
            setSessionId(freshId);
            setTimeout(() => connect(buildWsUrl(freshId)), 800);
        },
        onHeavyMetal: (message) => {
            console.log('🤘 HEAVY METAL MODE ACTIVATED:', message);
            setStatus('HEAVY_METAL');
        }
    });

    // The real verdict, or the preview one under ?hud=dog / ?hud=notdog. Never
    // both: previewVerdict is null unless the URL asked for it.
    const shownVerdict = verdict ?? previewVerdict;

    const [reviewOpen, setReviewOpen] = useState(false);
    // ?hud=1 substitutes sample data so the panels can be laid out without a
    // session -- but that also masked what "clear" does, since the samples are
    // static. Once cleared, the preview shows the real (empty) state, which is
    // what the button actually produces.
    const [previewCleared, setPreviewCleared] = useState(false);

    // The model name for the header, before any session exists. The WebSocket
    // config frame carries the same value but only once a round starts, which
    // left the title reading AWAITING LINK on the idle screen -- the one place
    // every viewer looks first.
    const [advertisedModel, setAdvertisedModel] = useState(null);
    useEffect(() => {
        let cancelled = false;
        fetch('/api/config')
            .then((r) => (r.ok ? r.json() : null))
            .then((cfg) => {
                if (cancelled || !cfg) return;
                if (cfg.model) setAdvertisedModel(cfg.model);
                // Listed by the server, so the menu cannot offer a language the
                // backend would reject.
                if (cfg.languages) setLanguages(cfg.languages);
                if (cfg.default_language) setLanguage(cfg.default_language);
            })
            .catch(() => { /* mock server or offline; the config frame still fills it in */ });
        return () => { cancelled = true; };
    }, []);
    // Stays up after a round ends: reviewing a run you have just finished is the
    // main reason to open it, and the panels vanish the moment the socket closes.
    // Always on the main screen. It used to appear only once a socket opened,
    // on the grounds that zeroes look like a broken instrument -- but hiding the
    // panel also hides review, clear and save, and the model name, which are
    // exactly what you want before a run rather than during one.
    const hudVisible = true;
    // Sample data is a layout aid for ?hud=1 only. On the real idle screen the
    // panel shows real zeroes: fake figures sitting on the main screen would be
    // worse than no panel at all.
    const usingSamples = forceHud && socketStatus !== 'CONNECTED' && !sessionSamples.length && !previewCleared;
    const hudMetrics = usingSamples ? SAMPLE_METRICS : metrics;
    const hudEvents = usingSamples ? SAMPLE_EVENTS : events;
    const reviewSamples = sessionSamples.length ? sessionSamples : (usingSamples ? SAMPLE_SAMPLES : []);

    // Stop a run in progress. The Live session is billed for every second it is
    // open, and with the 65-second round timer gone this button is now the ONLY
    // thing that ends a session -- so it matters more than it did, not less.
    const endSession = () => {
        setStatus('IDLE');
        setVerdict(null);
    };

    const startRound = () => {
        setVerdict(null);
        setStatus('SCANNING');

        // A new round is a new conversation. The id is passed straight to
        // connect() rather than read back from state, which would still hold the
        // previous round's value in this tick.
        // A round starts clean. The record otherwise spans every round since
        // page load and the review draws them as one run with the gaps between
        // them flattened out -- the manual "clear" existed for exactly this and
        // should not have to be remembered.
        clearSession();
        dropCount.current = 0;
        const freshId = crypto.randomUUID();
        setSessionId(freshId);
        connect(buildWsUrl(freshId));
    };

    useEffect(() => {
        if (status === 'SCANNING') {
            startStream(videoRef.current);
        } else {
            // Anything that is not SCANNING means no run is in progress, so the
            // camera, microphone and the billed Live session all stop. This used
            // to list the four end states explicitly, which meant a new one --
            // IDLE, from the end-session button -- would have left all three
            // running until the tab was closed.
            stopStream();
            disconnect();

            if (status === 'HEAVY_METAL') {
                // Alarm first, then the pack over the top of it. This is the
                // one place sampled barking is literally correct: three or more
                // dogs are loose, and you should be able to hear that.
                playContainmentAlarm().catch(e => console.error('Alarm failed:', e));
                playPack().catch(e => console.error('Pack failed:', e));
            }
        }
    }, [status, startStream, stopStream, disconnect]);

    // The 65-second round timer is deliberately gone. It existed to bound a
    // handshake you could fail; scanning has nothing to fail at, and a countdown
    // over a demo would only make the presenter hurry. Sessions now end when
    // someone ends them -- see endSession, and note that this makes an abandoned
    // tab a billed session with no upper bound.
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [initiationWarning, setInitiationWarning] = useState(false);

    // The overlay's own copy says "wait for audio confirmation", so the
    // confirmation is what it should wait on -- not a fixed timer. The greeting
    // lands about 1.5s after connect, where the timer held the screen for 5.
    //
    // Derived rather than an effect that clears the flag: setState inside an
    // effect is a cascading render, and there is nothing to store here anyway.
    // The timeout in handleInitiateOverride remains as the backstop for a
    // session that never greets at all.
    const showInitiation =
        initiationWarning && !events.some((e) => e.kind === 'scanner');



    const handleInitiateOverride = async () => {
        try {
            // Request Camera and Microphone Permission immediately
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

            // If we get here, permission granted. 
            // Stop this temporary stream so startStream() can get a fresh one later (or we could pass it, but simpler to just release)
            stream.getTracks().forEach(track => track.stop());

            setPermissionDenied(false);

            // Show Warning/Startup sequence
            setInitiationWarning(true);
            startRound(); // Start camera/game immediately behind overlay

            // The overlay clears when the scanner actually speaks -- see the
            // effect below. This timeout is only the backstop for a session
            // that never greets, so it is longer than the old fixed wait rather
            // than shorter: nobody should be staring at it, and if they are,
            // something is wrong and the UI should get out of the way anyway.
            setTimeout(() => {
                setInitiationWarning(false);
            }, 8000);
        } catch (err) {
            console.error("Camera permission denied:", err);
            setPermissionDenied(true);
        }
    };

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden font-mono text-neon-cyan select-none">

            {/* Transport readout. Only while a socket is actually open -- zeroes
                on an idle screen look like a broken instrument. */}
            {/* One right-hand column so the two panels share a width and the
                trace can never grow into the stats box: the column owns the
                geometry, the panels only fill it. `?hud=1` shows them without a
                live socket, which is how the layout gets checked without opening
                a billed session. */}
            <div className="absolute top-4 right-4 bottom-4 z-40 w-72 flex flex-col gap-3 pointer-events-none">
                <Telemetry
                    metrics={hudMetrics}
                    visible={hudVisible}
                    targetFps={config.video_fps}
                    live={socketStatus === 'CONNECTED'}
                />
                {/* forceHud so the control is checkable without a camera. */}
                {(status === 'SCANNING' || forceHud) && (
                    <button
                        type="button"
                        onClick={endSession}
                        className="pointer-events-auto w-full border border-red-500/50 bg-black/60 px-3 py-2 text-red-400 text-[11px] uppercase tracking-[0.25em] hover:bg-red-500 hover:text-black focus:outline-none focus:ring-1 focus:ring-red-400 transition-colors"
                    >
                        End session
                    </button>
                )}

                <div className="mt-auto min-h-0 flex flex-col">
                    <EventTrace events={hudEvents} visible={hudVisible} onSave={saveSession} onReview={() => setReviewOpen(true)} onClear={() => { clearSession(); setPreviewCleared(true); }} />
                </div>
            </div>

            <SessionReview
                samples={reviewSamples}
                events={hudEvents}
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
            />


            {/* Mock Server Banner Ticker */}
            {isMock && (
                <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 z-[100] overflow-hidden bg-amber-500/90 border-y-2 border-amber-300 backdrop-blur-sm" style={{ height: '2.5rem' }}>
                    <div
                        className="whitespace-nowrap text-black font-bold text-sm uppercase tracking-widest flex items-center h-full"
                        style={{
                            animation: 'mock-ticker 18s linear infinite',
                        }}
                    >
                        {/* Repeat the message so the scroll feels seamless */}
                        {Array(6).fill('⚠ MOCK SERVER ACTIVE — THIS IS A SIMULATION — NO ACTIONS WILL BE EXECUTED    ').join('')}
                    </div>
                </div>
            )}
            {/* ... (background video remains same) ... */}
            <video
                ref={videoRef}
                muted
                playsInline
                className="absolute top-0 left-0 w-full h-full object-cover z-0 opacity-50 grayscale transition-all duration-1000"
            />

            {/* Scanlines Overlay - Disable on end game for clear view */}
            {status === 'SCANNING' && <div className="scanlines z-10"></div>}

            {/* Permission Denied Overlay */}
            {permissionDenied && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in">
                    <div className="text-center border border-red-500 p-10 rounded bg-red-950/20 box-shadow-xl">
                        <h1 className="text-4xl font-bold text-red-500 mb-4 animate-pulse">ACCESS DENIED</h1>
                        <p className="text-xl text-red-300 mb-8">OPTICAL SENSOR OFFLINE</p>
                        <p className="text-sm text-gray-400 mb-8">Camera access required to scan subjects.</p>
                        <button
                            onClick={() => setPermissionDenied(false)}
                            className="px-6 py-2 border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                        >
                            ACKNOWLEDGE
                        </button>
                    </div>
                </div>
            )}

            {/* Initialization Warning Overlay */}
            {showInitiation && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
                    <div className="text-center max-w-2xl px-8">
                        <h1 className="text-4xl font-bold text-yellow-500 mb-6 animate-pulse">INITIALIZING SCANNER...</h1>
                        <div className="text-xl text-yellow-200/80 mb-8 space-y-4 font-mono">
                            <p>ESTABLISHING SECURE CHANNEL.</p>
                            <p className="border-t border-b border-yellow-500/30 py-4">
                                WAIT FOR AUDIO CONFIRMATION:<br />
                                <span className="text-white font-bold">"Scanner Online."</span>
                            </p>
                        </div>
                        <div className="w-full h-1 bg-yellow-900 rounded-full overflow-hidden">
                            <div className="h-full bg-yellow-400 animate-[width_3s_linear_forwards]" style={{ width: '0%' }}></div>
                        </div>
                    </div>
                </div>
            )}

            {status === 'SYSTEM_ERROR' && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-red-950 animate-pulse">
                    <div className="text-center p-12 border-4 border-red-600 bg-black shadow-[0_0_100px_rgba(255,0,0,0.5)]">
                        <h1 className="text-7xl font-black text-red-600 mb-6 tracking-tighter">
                            SYSTEM ERROR
                        </h1>
                        <div className="h-1 w-full bg-red-600 mb-8"></div>
                        {/* Says what actually happened. Only one thing reaches
                            this screen -- agent.py's trigger_system_error(),
                            whose whole trigger is "a cat is presented" -- and
                            the copy here blamed an OFFENSIVE GESTURE, which is
                            the finger build's fail state and impossible in a
                            scanner with no gestures. Someone holds up a cat and
                            the machine cited them for rudeness. The reason line
                            is the tool's own return string. */}
                        <p className="text-2xl text-red-400 font-bold mb-4 uppercase">
                            Feline Detected
                        </p>
                        <p className="text-lg text-red-500/80 mb-12 font-mono">
                            REASON: FELINE INTRUSION // SCANNER INTEGRITY LOST
                        </p>
                        <div className="text-sm text-red-700 animate-pulse">
                            TERMINATING SESSION...
                        </div>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-12 px-10 py-4 border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-black font-bold transition-all"
                        >
                            REBOOT SYSTEM
                        </button>
                    </div>
                </div>
            )}

            {status === 'HEAVY_METAL' && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black animate-fade-in">
                    {/* CSS-only strobe/scanline field. Replaces a giphy hotlink
                        that 404s -- so this rendered nothing at all -- and it
                        works offline and under a strict CSP. */}
                    <div className="absolute inset-0 opacity-30 animate-pulse-fast bg-[repeating-linear-gradient(0deg,#fff_0px,#fff_1px,transparent_1px,transparent_4px),repeating-linear-gradient(90deg,#ff003c_0px,#ff003c_2px,transparent_2px,transparent_9px)] contrast-150"></div>
                    <div className="relative text-center p-12 border-8 border-red-600 bg-black/80 shadow-[0_0_150px_rgba(255,0,0,0.4)] animate-shake">
                        <h1 className="text-8xl font-black text-red-600 mb-4 tracking-tighter drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]">
                            CONTAINMENT BREACH
                        </h1>
                        <div className="h-2 w-full bg-gradient-to-r from-transparent via-red-600 to-transparent mb-8"></div>
                        {/* The words the scanner actually speaks (agent.py rule
                            4): "Alert. Containment has failed. The dogs have
                            been released." This read THE DOGS ARE OUT, which is
                            the song -- the exact reference the instruction below
                            forbids the model from making, printed six inches
                            above it in 4xl. The screen and the voice now say the
                            same thing, and neither of them is quoting anybody. */}
                        <p className="text-4xl text-white font-black mb-8 uppercase tracking-[0.3em] animate-pulse">
                            THE DOGS HAVE BEEN RELEASED
                        </p>
                        {/* Deliberately not the song, and deliberately not a
                            joke the interface is in on. The scanner reports a
                            perimeter failure in the flattest language it has;
                            the audience supplies the rest. Nothing here is
                            licensed from anybody, visual or audio -- the last
                            build lost an easter egg to a dead archive.org
                            hotlink and got it back by synthesising the sound. */}
                        <p className="text-xl text-red-400 font-mono mb-12">
                            PERIMETER INTEGRITY LOST // CANINE COUNT &gt;= 3
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-12 py-4 bg-red-600 text-black font-black text-2xl hover:bg-white hover:scale-110 transition-all shadow-[0_0_30px_rgba(255,0,0,0.6)]"
                        >
                            RESTORE CONTAINMENT
                        </button>
                    </div>
                </div>
            )}

            {/* Main HUD */}
            <div className={`relative z-20 flex flex-col items-center justify-between h-full py-10 px-4 transition-opacity duration-500 ${status !== 'SCANNING' && status !== 'IDLE' && status !== 'HEAVY_METAL' ? 'opacity-20 blur-sm' : 'opacity-100'}`}>

                {/* Header */}
                <div className="w-full max-w-4xl flex justify-between items-center border-b-2 border-neon-cyan/50 pb-4 bg-black/60 backdrop-blur-sm p-6 rounded-t-xl">
                    <div>
                        {/* The model actually behind the glass, straight from the
                            server's config frame. It used to say MISSION ALPHA,
                            which told a viewer nothing and could not go stale
                            because it was never true in the first place. Smaller
                            and less letter-spaced than the old title: model ids
                            are long, and a long preview model id at 4xl
                            with 0.2em tracking does not fit the header. */}
                        <h2
                            className="text-2xl font-black text-white tracking-tight mb-2 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] break-all"
                            title="Live model reported by the backend"
                        >
                            {config.model || advertisedModel || 'AWAITING LINK'}
                        </h2>
                        {/* The agent's own description of itself, verbatim from
                            agent.py's instruction. "SECURITY PROTOCOL: LEVEL 5"
                            came from the finger build's lock and described
                            nothing this app does. */}
                        <h1 className="text-xl font-bold tracking-widest text-glow text-neon-cyan">CANINE VERIFICATION INTERROGATOR</h1>
                        {/* "Canine Signature Required" was the biometric build's
                            phrasing wearing a dog costume -- nothing here reads
                            a signature and nothing is required of the subject.
                            The agent's own first line is "ultra-low-latency
                            determination of whether a presented subject is a
                            dog"; this is that, at subtitle length. */}
                        <div className="text-xs text-neon-cyan/70">Present subject for canine determination</div>
                    </div>
                    <div className={`px-4 py-2 text-xl font-bold border animate-pulse ${status === 'IDLE' ? 'border-red-500 text-red-500' :
                        status === 'SCANNING' && socketStatus === 'CONNECTED' ? 'border-yellow-400 text-yellow-400' :
                            'border-red-600 text-red-600'
                        }`}>
                        {status === 'IDLE' && 'STANDBY'}
                        {status === 'SCANNING' && (
                            <div className="flex items-center gap-3">
                                {socketStatus === 'CONNECTED' ? (
                                    <>
                                        <span>SURVEILLANCE ACTIVE</span>
                                        {/* Network Pulse Indicator - Subtle Radar Blip */}
                                        <div className="relative flex items-center justify-center w-6 h-6 ml-1">
                                            {/* Expanding Ping Ring */}
                                            <div 
                                                className="absolute w-full h-full rounded-full border border-neon-cyan/40"
                                                style={{
                                                    animation: `ring-pulse ${config.heartbeat_interval}s infinite ease-out`
                                                }}
                                            ></div>
                                            {/* Central Status Dot */}
                                            <div 
                                                className="relative w-1.5 h-1.5 rounded-full bg-neon-cyan shadow-[0_0_8px_#00ffff]"
                                                style={{
                                                    animation: `heartbeat-pulse ${config.heartbeat_interval}s infinite linear`
                                                }}
                                            ></div>
                                        </div>
                                    </>
                                ) : (
                                    'SCANNER LINK DROPPED // OFFLINE'
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Center Challenge */}
                <div className="flex-1 flex flex-col items-center justify-center gap-12 w-full max-w-4xl">

                    {status === 'IDLE' && !previewScreen && (
                        <div className="flex flex-col items-center gap-6">
                            <ScannerReticle className="w-36 h-36 text-neon-cyan/70 animate-pulse" />

                            {/* Chosen before the socket opens, because the Live
                                session's speech_config is fixed at connect. The
                                scanner then answers in that language throughout
                                -- the clearest evidence in the demo that a model
                                is generating this and not a recording. */}
                            <label className="flex items-center gap-3 text-neon-cyan/70 text-sm uppercase tracking-widest">
                                Scanner language
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="bg-black border border-neon-cyan/40 text-neon-cyan px-3 py-1.5 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                                >
                                    {Object.entries(languages).map(([code, name]) => (
                                        <option key={code} value={code}>{name}</option>
                                    ))}
                                </select>
                            </label>

                        <button
                            onClick={handleInitiateOverride}
                            className="px-12 py-6 text-2xl font-bold border-2 border-neon-cyan hover:bg-neon-cyan hover:text-black transition-all shadow-[0_0_20px_rgba(0,255,255,0.3)] animate-pulse"
                        >
                            BEGIN SURVEILLANCE
                        </button>
                        </div>
                    )}

                    {(status === 'SCANNING' || previewScreen) && (
                        <>
                            {/* The verdict.
                                Written to the screen as well as spoken, because
                                the demo is recorded: "WOLF — 71%" is legible in
                                a video where a spoken subject is not, and it is
                                the disagreements that are worth seeing. */}
                            <div className="flex flex-col items-center gap-4 min-h-[13rem] justify-center">
                                {shownVerdict === null ? (
                                    <>
                                        {/* The dog identity used to live only on
                                            the idle screen, so the moment the
                                            camera came up every trace of it left
                                            -- the scanning screen, which is the
                                            one people actually watch, was a line
                                            of cyan text on a webcam. Same
                                            reticle as idle, smaller and dimmer:
                                            it is a waiting state, not a title.
                                            Sized to stay inside the 13rem box so
                                            the SCAN button does not move when a
                                            verdict replaces it. */}
                                        <ScannerReticle className="w-24 h-24 text-neon-cyan/30 animate-pulse" />
                                        <div className="text-neon-cyan/40 text-4xl font-black tracking-widest uppercase">
                                            Awaiting Subject
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div
                                            className={`flex items-center gap-6 px-12 py-6 text-7xl font-black border-4 rounded-lg transition-all duration-300 ${shownVerdict.isDog
                                                ? 'border-neon-green text-neon-green bg-neon-green/10 shadow-[0_0_30px_rgba(0,255,65,0.5)]'
                                                : 'border-red-500 text-red-500 bg-red-500/10 shadow-[0_0_30px_rgba(255,0,0,0.4)]'
                                                }`}
                                        >
                                            <PawPrint className="w-14 h-14 shrink-0" barred={!shownVerdict.isDog} />
                                            {shownVerdict.isDog ? 'DOG' : 'NOT A DOG'}
                                        </div>
                                        <div className="text-3xl font-bold text-white uppercase tracking-wide text-center break-all">
                                            {shownVerdict.subject}
                                            {shownVerdict.confidence !== null && (
                                                <span className="text-neon-cyan/70 ml-3 tabular-nums">
                                                    {shownVerdict.confidence}%
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Instruction Text */}
                            <div className="text-center animate-pulse mt-8">
                                <p className="text-neon-cyan/80 text-lg uppercase tracking-widest border border-neon-cyan/30 px-6 py-2 rounded bg-black/40">
                                    {/* One word, and the one the wake listener
                                        actually matches. "CALIBRATE" was never
                                        recognised by anything -- neither the
                                        agent instruction nor wakeWord.js -- so
                                        the screen was telling people to say a
                                        word that did nothing. */}
                                    Hold Up Subject &amp; Say <span className="font-bold text-white">"SCAN"</span>
                                </p>
                            </div>

                            {/* Always rendered, not only where speech is
                                missing. wakeWord.js is Chrome/Edge only and its
                                fallback streams the microphone -- the path this
                                project measured at 0/5 -- so on Safari or
                                Firefox the spoken command above is a promise
                                the page cannot keep. A judge landing there
                                needs a control that works, and a presenter in
                                a noisy room wants one anyway. */}
                            <button
                                onClick={() => requestScan('button')}
                                className="mt-4 px-10 py-4 text-xl font-bold border-2 border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:text-black transition-all rounded shadow-[0_0_20px_rgba(0,255,255,0.25)]"
                            >
                                SCAN
                            </button>
                        </>
                    )}
                </div>

                {/* Footer / Timer */}
                <div className="w-full max-w-4xl grid grid-cols-3 items-end">
                    {/* nowrap and a small mark: the footer is a third of a 4xl
                        container, and "CONTINUOUS SURVEILLANCE" at text-xl very
                        nearly fills it on its own -- a 20px paw and a gap-3 was
                        enough to break it onto two lines. */}
                    <div className="text-xl flex items-center gap-2 whitespace-nowrap">
                        <PawPrint className="w-4 h-4 text-neon-cyan/60 shrink-0" />
                        CONTINUOUS SURVEILLANCE
                    </div>

                    <div className="flex justify-center">
                    </div>

                    <div className="text-right text-xl">
                        STATUS: {socketStatus}
                    </div>
                </div>

            </div>
        </div>
    );
}
