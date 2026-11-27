#!/usr/bin/env bash
# wait-reply.sh <issue-slug> [timeout-seconds]
# Resumes waiting on the pending question persisted by ask.sh.
# Exits 0 with "ANSWER: <text>" once a human reply appears in the thread (and records it in the
# state file), exit 2 on timeout, exit 1 on missing state or API error.
set -euo pipefail
SLUG="$1"; TIMEOUT="${2:-1800}"
STATE_DIR="$(cd "$(dirname "$0")/.." && pwd)/state"
STATE="$STATE_DIR/$SLUG.json"
[ -f "$STATE" ] || { echo "no pending question for '$SLUG' (run ask.sh first)" >&2; exit 1; }

# Already answered in a previous run?
DONE=$(python3 -c "import json;a=json.load(open('$STATE'))['answer'];print(a or '')")
if [ -n "$DONE" ]; then echo "ANSWER: $DONE"; exit 0; fi

CHANNEL=$(python3 -c "import json;print(json.load(open('$STATE'))['channel'])")
TS=$(python3 -c "import json;print(json.load(open('$STATE'))['ts'])")
DEADLINE=$(( $(date +%s) + TIMEOUT ))

while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  OUT=$(python3 - "$CHANNEL" "$TS" <<'PY'
import json, os, sys, urllib.request, urllib.parse
channel, ts = sys.argv[1], sys.argv[2]
hdr = {"Authorization": f"Bearer {os.environ['SLACK_BOT_TOKEN']}"}
def call(method, **params):
    url = f"https://slack.com/api/{method}?{urllib.parse.urlencode(params)}"
    d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=hdr)))
    if not d.get("ok"):
        print(f"ERROR: {method}: {d.get('error')}"); sys.exit(0)
    return d
bot = call("auth.test")["user_id"]
for m in call("conversations.replies", channel=channel, ts=ts).get("messages", [])[1:]:
    if m.get("user") and m["user"] != bot:
        print("REPLY:" + m["text"]); break
PY
  )
  case "$OUT" in
    ERROR:*) echo "$OUT" >&2; exit 1 ;;
    REPLY:*)
      ANSWER="${OUT#REPLY:}"
      python3 - "$STATE" "$ANSWER" <<'PY'
import json, sys
path, answer = sys.argv[1], sys.argv[2]
s = json.load(open(path)); s["answer"] = answer
json.dump(s, open(path, "w"), indent=2)
PY
      echo "ANSWER: $ANSWER"; exit 0 ;;
  esac
  sleep 15
done
echo "timeout: no reply after ${TIMEOUT}s (state kept: $STATE)" >&2
exit 2
