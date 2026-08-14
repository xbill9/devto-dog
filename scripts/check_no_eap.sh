#!/usr/bin/env bash
# Fail if anything that would be published names a non-public model.
#
# The repo goes public in the submission's Code section, so "we were careful" is
# not a control -- this is. It checks what git would actually publish (tracked
# files plus anything stageable), never the working tree at large, because the
# gitignored dev files are allowed to name whatever they like.
#
# Run standalone or via `make check-eap`; deploy.sh calls it before pushing.
set -euo pipefail

cd "$(dirname "$0")/.."

# Specific ids and families, not the bare word "preview" -- that appears in
# `vite preview` and half of npm's vocabulary, and a gate that cries wolf is a
# gate people start passing with --no-verify.
PATTERNS='gemini-3|3\.1-flash|flash-live-preview|native-audio-preview'

# git ls-files honours .gitignore, so this is exactly the publish surface.
# -I skips binary files. Errors are ignored when no files match at all.
#
# This file is excluded from its own scan: the first run failed on its own
# PATTERNS line, which is funny once and an infinite loop thereafter.
if hits=$(git ls-files -z \
    | grep -zv '^scripts/check_no_eap\.sh$' \
    | xargs -0 grep -InE "$PATTERNS" 2>/dev/null); then
    echo "EAP CHECK FAILED -- these would be published:" >&2
    echo "$hits" >&2
    echo >&2
    echo "Take the id out of the tree, or add the file to .gitignore." >&2
    exit 1
fi

echo "EAP check passed: $(git ls-files | wc -l | tr -d ' ') tracked files name no non-public model."
