#!/usr/bin/env bash
# usage: ask.sh <issue-slug> <question text>
# Posts the question to Slack once and persists the thread state; recovers the state from Slack
# (via the [issue-to-pr:<slug>] marker) when the local file is gone, e.g. after a fresh clone.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: ask.sh <issue-slug> <question text>" >&2; exit 1; }
exec python3 "$(dirname "$0")/slack_qa.py" ask "$1" "$2"
