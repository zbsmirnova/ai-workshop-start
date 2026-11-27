#!/usr/bin/env bash
# usage: reply.sh [--notify] <issue-slug> <text>
set -euo pipefail
exec python3 "$(dirname "$0")/slack_qa.py" reply "$@"
