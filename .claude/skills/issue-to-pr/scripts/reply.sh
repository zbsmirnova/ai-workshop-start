#!/usr/bin/env bash
# usage: reply.sh <issue-slug> <text>
# Posts a follow-up (or the closing PR link) into the question's thread. After a follow-up,
# `wait-reply.sh` waits for a reply newer than it.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: reply.sh <issue-slug> <text>" >&2; exit 1; }
exec python3 "$(dirname "$0")/slack_qa.py" reply "$1" "$2"
