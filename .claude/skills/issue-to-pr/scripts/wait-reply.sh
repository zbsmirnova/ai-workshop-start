#!/usr/bin/env bash
# usage: wait-reply.sh <issue-slug> [timeout-seconds]
# Waits for a human reply in the pending question's thread (newer than the bot's last message).
# Prints "ANSWER: <text>" and records it. Transient network/rate-limit errors are retried with
# backoff. Exit: 0 answered, 1 usage/missing state/token, 2 timeout (resume later), 3 fatal API error.
set -euo pipefail
[ $# -ge 1 ] || { echo "usage: wait-reply.sh <issue-slug> [timeout-seconds]" >&2; exit 1; }
exec python3 "$(dirname "$0")/slack_qa.py" wait "$@"
