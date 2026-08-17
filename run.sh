#!/usr/bin/env bash
# Wordhoard VPS runner.
# Pulls the latest lexicon.json, then sends today's lesson. A failed pull is a
# warning and nothing more: the lexicon already on disk still teaches the day.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
git pull --quiet --no-edit origin main 2>/dev/null \
  || echo "[run] WARN: git pull failed; sending from the lexicon already on disk"
exec /usr/bin/node send.mjs
