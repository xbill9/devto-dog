#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

PROJECT_ID_FILE="$HOME/project_id.txt"
KEY_FILE="$HOME/gemini.key"

for f in "$PROJECT_ID_FILE" "$KEY_FILE"; do
    if [ ! -s "$f" ]; then
        echo "Error: $f is missing or empty. Run ./init.sh first." >&2
        exit 1
    fi
done

PROJECT_ID=$(<"$PROJECT_ID_FILE")
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-dog-or-not}"
IMAGE_PATH="${IMAGE_PATH:-gcr.io/${PROJECT_ID}/${SERVICE_NAME}}"
SECRET_NAME="${SECRET_NAME:-gemini-api-key}"

# ---------------------------------------------------------------------------
# Sync the API key into Secret Manager.
#
# The key is never passed on the gcloud command line and never stored in the
# Cloud Run revision spec, so it does not leak to anyone holding
# run.services.get or to retained build history.
# ---------------------------------------------------------------------------
KEY_VALUE=$(<"$KEY_FILE")

# gcloud --data-file uploads the file byte-for-byte, so write a copy without
# the trailing newline; otherwise the comparison below never matches and every
# deploy adds a redundant secret version. mktemp creates it mode 600.
TMP_KEY=$(mktemp)
trap 'rm -f "$TMP_KEY"' EXIT
printf '%s' "$KEY_VALUE" > "$TMP_KEY"

if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo "Creating secret ${SECRET_NAME}..."
    gcloud secrets create "$SECRET_NAME" \
      --replication-policy=automatic \
      --project="$PROJECT_ID"
fi

CURRENT_VALUE=$(gcloud secrets versions access latest \
  --secret="$SECRET_NAME" --project="$PROJECT_ID" 2>/dev/null || true)

if [ "$CURRENT_VALUE" != "$KEY_VALUE" ]; then
    echo "Adding new version of ${SECRET_NAME}..."
    gcloud secrets versions add "$SECRET_NAME" \
      --data-file="$TMP_KEY" \
      --project="$PROJECT_ID"
fi

# Let the Cloud Run runtime service account read the secret (idempotent).
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/secretmanager.secretAccessor \
  --project="$PROJECT_ID" >/dev/null

# ---------------------------------------------------------------------------
# Deploy.
#
# --set-env-vars replaces the whole environment, so every variable must go in
# a single flag. Repeating the flag keeps only the last one.
#
# The `^@^` prefix switches the separator from comma to `@`. Without it,
# ALLOWED_ORIGINS could never hold more than one origin -- a comma inside a
# value is read as the start of the next variable, and gcloud rejects the whole
# invocation with a usage dump.
#
# That is not hypothetical. Cloud Run issues a service TWO hostnames: a legacy
# `{service}-{hash}-{region}.a.run.app` and a newer
# `{service}-{project-number}.{region}.run.app`. `gcloud run services describe`
# reports the first; `gcloud run deploy` prints the second. Both serve. A
# browser loading the page from one sends that one as its WebSocket Origin, so
# an allowlist holding only the other rejects the handshake -- and the demo
# fails for whoever happened to use the other link.
# ---------------------------------------------------------------------------
# A WebSocket is a single long-lived request to Cloud Run, so the request
# timeout is the session cap. The default is 300s, which silently severed the
# Live session five minutes in; 3600s is the maximum.
#
# Instance bounds are a spend cap, not a performance setting, and both
# directions cost something:
#
#   --min-instances=0  lets it scale to nothing when idle, so an abandoned tab
#                      or a forgotten deploy stops costing anything. The price
#                      is a cold start on the next visit -- importing ADK and
#                      google-genai is slow, and it lands on the first
#                      connection of the session rather than in the background.
#   --max-instances=1  caps the blast radius: one container, so a link that
#                      gets shared cannot fan out into many billed Live
#                      sessions at once. Note this is not a one-user cap --
#                      Cloud Run's default concurrency is 80 requests per
#                      instance, so several visitors are served by the same
#                      container. The real ceiling is its CPU: every session is
#                      a long-lived socket decoding JPEG and audio, so a few
#                      simultaneous scans degrade before anything queues.
#
# Override either without editing this file:
#   MIN_INSTANCES=1 MAX_INSTANCES=4 ./deploy.sh
#
# ALLOWED_ORIGINS gates the WebSocket handshake (CORS does not apply to it).
# Leave it empty and the endpoint accepts any origin, which on a public
# --allow-unauthenticated URL means anyone can stream into your billed Live
# session. Set it to the service URL once you know it:
#   ALLOWED_ORIGINS=https://dog-or-not-xxxx.run.app ./deploy.sh
ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-}"

gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_PATH}" \
  --platform=managed \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --allow-unauthenticated \
  --timeout=3600 \
  --min-instances="${MIN_INSTANCES:-0}" \
  --max-instances="${MAX_INSTANCES:-1}" \
  --labels=dev-tutorial=multi-modal \
  --set-env-vars="^@^GOOGLE_CLOUD_PROJECT=${PROJECT_ID}@GOOGLE_CLOUD_LOCATION=${REGION}@GOOGLE_GENAI_USE_VERTEXAI=False@MODEL_ID=${MODEL_ID:-gemini-2.5-flash-native-audio-latest}@ALLOWED_ORIGINS=${ALLOWED_ORIGINS}" \
  --set-secrets="GOOGLE_API_KEY=${SECRET_NAME}:latest,GEMINI_API_KEY=${SECRET_NAME}:latest,GEMINI_KEY=${SECRET_NAME}:latest"

if [ -z "$ALLOWED_ORIGINS" ]; then
    echo
    echo "WARNING: deployed with an open WebSocket origin policy." >&2
    echo "Re-run with ALLOWED_ORIGINS=<service url> to lock it down." >&2
fi
