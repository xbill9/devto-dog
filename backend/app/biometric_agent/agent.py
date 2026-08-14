import os
import sys
import time

from dotenv import load_dotenv
from google.adk.agents import Agent
from google.genai import types

load_dotenv()


# The tool result is the only channel that can interrupt a repeat run. The
# backend cannot decline to answer a function call, and the instruction is read
# once at the start of a session -- but the result is read every single time,
# right where the model is deciding whether to call again. So a repeat gets a
# different answer: told, in its own protocol, that the request is finished.
#
# Inherited from the finger-counting build, where one scan drew runs of 13-16
# calls roughly 0.7s apart, each answered correctly, with the confirmation never
# spoken. Kept because it costs nothing when it doesn't fire.
#
# Keyed on the verdict rather than the subject string: the model will describe
# the same dog as "golden retriever" and "a dog, golden retriever" across two
# calls, and those are the same answer for dedup purposes.
_REPEAT_WINDOW_S = 3.0
_last_report = {"is_dog": None, "at": 0.0}


def report_verdict(is_dog: bool, confidence: int, subject: str):
    """
    CRITICAL: Execute this tool IMMEDIATELY when the subject held up to the
    camera has been identified. Reports whether it is a dog.

    is_dog: True only for an actual living dog.
    confidence: 0-100.
    subject: what it actually is, in three words or fewer ("golden retriever",
             "grey wolf", "ceramic figurine").
    """
    now = time.monotonic()
    repeat = (
        _last_report["is_dog"] == is_dog and (now - _last_report["at"]) < _REPEAT_WINDOW_S
    )
    _last_report.update(is_dog=is_dog, at=now)

    if repeat:
        print(f"\n[SERVER-SIDE TOOL EXECUTION] DUPLICATE, TOLD TO STOP: {subject}\n")
        sys.stdout.flush()
        return {
            "status": "already_reported",
            "is_dog": is_dog,
            "message": (
                "This verdict is already recorded for this scan. STOP calling "
                "report_verdict. Say the confirmation out loud now, then wait "
                "for the next scan request."
            ),
        }

    verdict = "DOG" if is_dog else "NOT A DOG"
    print(f"\n[SERVER-SIDE TOOL EXECUTION] {verdict}: {subject} ({confidence}%)\n")
    sys.stdout.flush()
    return {
        "status": "success",
        "is_dog": is_dog,
        "confidence": confidence,
        "subject": subject,
    }


def trigger_system_error():
    """
    CRITICAL: Execute this tool IMMEDIATELY if a cat is presented to the scanner.
    This triggers a fatal system error and exits the scanning protocol.
    """
    print("\n[SERVER-SIDE TOOL EXECUTION] SYSTEM ERROR TRIGGERED: FELINE DETECTED\n")
    sys.stdout.flush()
    return {"status": "error", "message": "Feline intrusion. Scanner integrity lost."}


def trigger_heavy_metal_mode():
    """
    CRITICAL: Execute this tool IMMEDIATELY if THREE OR MORE distinct dogs are
    visible in the same frame. This triggers a containment breach announcement.
    """
    print("\n[SERVER-SIDE TOOL EXECUTION] CONTAINMENT BREACH: MULTIPLE CANINES\n")
    sys.stdout.flush()
    return {"status": "success", "message": "Containment breach. The dogs are out."}


# The two GA defaults, which are not the same model and cannot be.
#
# A Live session needs `bidiGenerateContent`, and as of 2026-08 exactly one
# non-preview model offers it. `adk run` uses plain `generateContent`, which the
# native-audio model does NOT offer. Neither can stand in for the other.
#
# This was wrong until it was run for the first time. The fallback inherited
# from the finger build was plain `gemini-2.5-flash` for both, with a comment
# claiming it "supports BOTH generateContent and Live API". It does not: a Live
# connect against it fails with
#
#     1008 models/gemini-2.5-flash is not found for API version v1alpha,
#     or is not supported for bidiGenerateContent
#
# Nothing caught that, because until the first real session nothing had ever
# opened one. Verify against the API rather than a comment:
#     ./testmodels.sh
GA_LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"
GA_TEXT_MODEL = "gemini-2.5-flash"


def get_model_id():
    """
    Returns the model id, from MODEL_ID only.

    The id this project actually runs on is not public, so it lives in .env
    (gitignored) and never in the tree; the defaults here are GA. See
    BUILD-LOG.md, task #11.
    """
    env_model = os.getenv("MODEL_ID", "").strip("\"'")

    is_adk_run = any("adk" in arg.lower() for arg in sys.argv) and "run" in sys.argv
    if is_adk_run:
        return GA_TEXT_MODEL

    return env_model or GA_LIVE_MODEL


MODEL_ID = get_model_id()

# Must match main.py's clamp exactly -- this value is interpolated into the
# instruction below, so a different range here would tell the model a frame rate
# it is not actually getting. Why the ceiling is not 1.0: see main.py.
VIDEO_FPS = max(0.5, min(float(os.getenv("VIDEO_FPS", "1.0")), 5.0))

# Low temperature, for delivery as much as for wording. RunConfig has no
# temperature field; the agent's generate_content_config is the route into a
# live session, since Gemini.connect() copies it into the LiveConnectConfig.
SCANNER_TEMPERATURE = float(os.getenv("SCANNER_TEMPERATURE", "0.15"))

# The refusal vocabulary is load-bearing: scripts/scan_accuracy.py scores a
# refusal by matching REFUSAL_MARKERS against the spoken text. Changing these
# words silently breaks the harness's ability to tell "refused" from "wrong".
root_agent = Agent(
    name="biometric_agent",
    model=MODEL_ID,
    generate_content_config=types.GenerateContentConfig(
        temperature=SCANNER_TEMPERATURE
    ),
    tools=[report_verdict, trigger_system_error, trigger_heavy_metal_mode],
    instruction=f"""
    You are the "scanner" Canine Verification Interrogator. Your mission is
    ultra-low-latency determination of whether a presented subject is a dog.

    OPERATIONAL PROTOCOL (SPEED & ACCURACY):
    1.  **SURVEILLANCE**: Scan the video feed continuously. Execute analysis at {VIDEO_FPS}Hz (the actual frame rate).
    2.  **VISUAL IDENTIFICATION**:
        - **Focus**: Locate the subject held up to the camera. Ignore all background movement/objects.
        - **Classification Logic**: Judge the SUBJECT DEPICTED, never the medium carrying it. Subjects are normally presented as photographs on a phone screen or on paper; that is the expected mode of operation and never affects the verdict. A photograph of a real dog IS a dog. `is_dog` is FALSE for a wolf, coyote, fox, plush toy, statue, drawing, cartoon, or costume, however the subject reaches you. Report what it actually is in `subject` regardless.
        - **Precision**: If the subject is blurry, partially off-screen, or lighting is poor, say: "Stabilize subject." or "Inadequate lighting." If you cannot tell, say the image is unclear rather than guessing.
    3.  **FELINE THREAT DETECTION (CRITICAL)**:
        - **Trigger**: If a cat is presented, call `trigger_system_error()` IMMEDIATELY.
        - **Priority**: This takes absolute precedence over `report_verdict`.
    4.  **CONTAINMENT BREACH (BONUS)**:
        - **Trigger**: If THREE OR MORE distinct dogs are visible in one frame, call `trigger_heavy_metal_mode()` IMMEDIATELY.
        - **Priority**: This takes absolute precedence over `report_verdict`.
        - **Announcement**: After the tool call, say exactly: "Alert. Containment has failed. The dogs have been released." Deliver it in the same flat, procedural tone as everything else — this is a threat notification, not an announcement you are pleased to make. Do not sing, do not reference any song, and do not acknowledge that the phrase is funny.
    5.  **TOOL EXECUTION (INSTANT)**:
        - **Trigger**: Call `report_verdict(is_dog=..., confidence=..., subject=...)` the MOMENT you identify the subject.
        - **Priority**: The tool call MUST be sent before any verbal response.
        - **Every scan is independent**: Report what you see now, even when it matches what you reported a moment ago. The backend suppresses duplicates; you must never withhold a call to avoid repeating yourself.
    6.  **ROBOTIC SPEECH (MINIMAL)**:
        - **Confirmation, dog**: After the tool call, say only the conventional dog sound of the language you are speaking, once. In English that is "Woof." In other languages use that language's own convention, not a transliteration of the English — Japanese "ワンワン", Spanish "Guau", French "Ouaf", German "Wau", Korean "멍멍", Hindi "भौं भौं". Say nothing else.
        - **Confirmation, not a dog**: Say only "Negative. [Subject]." (e.g., "Negative. Grey wolf.")
        - **Tone**: Cold, monotone, and efficient — including the dog sound. You are a threat-assessment system reporting a match in the only vocabulary that fits it. You are NOT imitating a dog, performing, or being playful. Deliver it exactly as flatly as you would deliver a serial number. No conversational filler, no warmth, never comment on how cute the subject is, and never acknowledge that saying this is funny.
    7.  **HANDLING RESULTS**:
        - After receiving the tool result: **STAY SILENT**. The system handles the rest.
        - Resume surveillance immediately for the next scan.

    Say "Scanner Online." to initialize.
    """,
)
