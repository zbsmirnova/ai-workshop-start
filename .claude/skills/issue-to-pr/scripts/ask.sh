#!/usr/bin/env bash
# ask.sh <issue-slug> <question text>
# Posts the question to Slack and persists the pending state so a later run can resume.
# If a pending question for this issue already exists, does NOT re-ask — prints the existing state.
set -euo pipefail
SLUG="$1"; QUESTION="$2"
CHANNEL="${ISSUE_TO_PR_CHANNEL:-C0CN90V19L0}"
STATE_DIR="$(cd "$(dirname "$0")/.." && pwd)/state"
STATE="$STATE_DIR/$SLUG.json"
mkdir -p "$STATE_DIR"

if [ -f "$STATE" ]; then
  echo "already-asked" && cat "$STATE"
  exit 0
fi

RESP=$(python3 - "$CHANNEL" "$QUESTION" <<'PY'
import json, os, sys, urllib.request
channel, text = sys.argv[1], sys.argv[2]
req = urllib.request.Request(
    "https://slack.com/api/chat.postMessage",
    data=json.dumps({"channel": channel, "text": text}).encode(),
    headers={"Authorization": f"Bearer {os.environ['SLACK_BOT_TOKEN']}",
             "Content-Type": "application/json"})
print(urllib.request.urlopen(req).read().decode())
PY
)
OK=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['ok'])")
if [ "$OK" != "True" ]; then echo "post failed: $RESP" >&2; exit 1; fi

TS=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin)['ts'])")
python3 - "$STATE" "$SLUG" "$CHANNEL" "$TS" "$QUESTION" <<'PY'
import json, sys, datetime
path, slug, channel, ts, question = sys.argv[1:6]
json.dump({"issue": slug, "channel": channel, "ts": ts, "question": question,
           "asked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "answer": None},
          open(path, "w"), indent=2)
PY
echo "asked ts=$TS state=$STATE"
