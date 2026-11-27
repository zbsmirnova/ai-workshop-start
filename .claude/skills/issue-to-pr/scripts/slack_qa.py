#!/usr/bin/env python3
"""Slack Q&A for the issue-to-pr skill.

Subcommands:
  ask <slug> <question>        Post the question once; recover state from Slack if the local
                               state file is missing (fresh clone). Tags the message with
                               [issue-to-pr:<slug>] so it can be found again.
  wait <slug> [timeout-sec]    Wait for a human reply newer than the last bot message in the
                               thread; record it in the state file and print "ANSWER: <text>".
  reply <slug> <text>          Post a follow-up into the thread; future `wait` calls then wait
                               for a reply newer than this follow-up.

Environment:
  SLACK_BOT_TOKEN              Token; falls back to ~/.slack_token (written by .air/cloud/startup.sh,
                               since Air cloud does not propagate the secret to the agent shell).
  ISSUE_TO_PR_CHANNEL          Channel ID for questions (default: C0CN90V19L0).
  ISSUE_TO_PR_STATE_DIR        State directory (default: <skill>/state).
  ISSUE_TO_PR_POLL_INTERVAL    Base poll interval in seconds (default: 30).
  SLACK_API_BASE               API base URL (default: https://slack.com/api); for tests.

Exit codes: 0 answered/ok, 1 usage, missing state or missing token, 2 timeout, 3 fatal API error.
"""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

API = os.environ.get("SLACK_API_BASE", "https://slack.com/api").rstrip("/")
CHANNEL = os.environ.get("ISSUE_TO_PR_CHANNEL", "C0CN90V19L0")
STATE_DIR = os.environ.get(
    "ISSUE_TO_PR_STATE_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state"))
POLL = float(os.environ.get("ISSUE_TO_PR_POLL_INTERVAL", "30"))
# ok:false errors that will not recover by retrying.
FATAL = {"invalid_auth", "account_inactive", "token_revoked", "token_expired", "not_authed",
         "channel_not_found", "not_in_channel", "is_archived", "missing_scope", "restricted_action"}

def fail(msg, code):
    print(msg, file=sys.stderr); sys.exit(code)

def token():
    t = os.environ.get("SLACK_BOT_TOKEN")
    if not t:
        path = os.path.expanduser("~/.slack_token")
        if os.path.isfile(path):
            t = open(path).read().strip()
    if not t:
        fail("no Slack token: set SLACK_BOT_TOKEN or provide ~/.slack_token "
             "(.air/cloud/startup.sh writes it in Air cloud)", 1)
    return t

class Transient(Exception): pass
class Fatal(Exception): pass

def call(method, payload=None, **params):
    """One Slack API call. Raises Transient (worth retrying) or Fatal."""
    if payload is not None:
        req = urllib.request.Request(f"{API}/{method}", data=json.dumps(payload).encode(),
                                     headers={"Authorization": f"Bearer {token()}",
                                              "Content-Type": "application/json"})
    else:
        req = urllib.request.Request(f"{API}/{method}?{urllib.parse.urlencode(params)}",
                                     headers={"Authorization": f"Bearer {token()}"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
    except urllib.error.HTTPError as e:
        retry = e.headers.get("Retry-After")
        raise Transient(f"{method}: HTTP {e.code}" + (f" (retry-after {retry}s)" if retry else ""),
                        float(retry) if retry else None)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        raise Transient(f"{method}: {e}", None)
    if not d.get("ok"):
        err = d.get("error", "unknown")
        if err in FATAL:
            raise Fatal(f"{method}: {err}")
        retry = d.get("retry_after")
        raise Transient(f"{method}: {err}", float(retry) if retry else None)
    return d

def state_path(slug):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", slug):
        fail(f"invalid slug '{slug}': use lowercase letters, digits and dashes", 1)
    os.makedirs(STATE_DIR, exist_ok=True)
    return os.path.join(STATE_DIR, f"{slug}.json")

def save(path, state):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)

def unescape(text):
    return text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")

def marker(slug):
    return f"[issue-to-pr:{slug}]"

def is_human(m, bot_id):
    return m.get("user") and m["user"] != bot_id and not m.get("bot_id") and not m.get("subtype")

def cmd_ask(slug, question):
    path = state_path(slug)
    if os.path.exists(path):
        print("already-asked"); print(open(path).read()); return
    # Fresh clone: the state file is gitignored, so look for the question in Slack itself.
    try:
        hist = call("conversations.history", channel=CHANNEL, limit=200)
    except Transient as e:
        fail(f"transient Slack error, retry later: {e.args[0]}", 2)
    except Fatal as e:
        fail(f"fatal Slack error: {e}", 3)
    for m in hist.get("messages", []):
        if marker(slug) in m.get("text", "") and m.get("ts"):
            state = {"issue": slug, "channel": CHANNEL, "ts": m["ts"], "last_ts": m["ts"],
                     "question": m["text"], "answer": None, "recovered": True}
            save(path, state)
            print("recovered-from-slack"); print(json.dumps(state, indent=2)); return
    # Take the lock *before* posting, so two concurrent runs cannot both post.
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        print("already-asked"); print(open(path).read()); return
    text = f"{question}\n_{marker(slug)}_"
    try:
        resp = call("chat.postMessage", payload={"channel": CHANNEL, "text": text})
    except (Transient, Fatal) as e:
        os.close(fd); os.unlink(path)
        fail(f"post failed: {e.args[0]}", 3 if isinstance(e, Fatal) else 2)
    import datetime
    state = {"issue": slug, "channel": CHANNEL, "ts": resp["ts"], "last_ts": resp["ts"],
             "question": text,
             "asked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
             "answer": None}
    os.write(fd, json.dumps(state, indent=2).encode()); os.close(fd)
    print(f"asked ts={resp['ts']} state={path}")

def cmd_wait(slug, timeout):
    path = state_path(slug)
    if not os.path.exists(path):
        fail(f"no pending question for '{slug}' (run ask first)", 1)
    state = json.load(open(path))
    state.setdefault("last_ts", state["ts"])  # state written before follow-up support
    if state.get("answer"):
        print(f"ANSWER: {state['answer']}"); return
    deadline = time.monotonic() + timeout
    delay, bot_id = POLL, None
    while time.monotonic() < deadline:
        try:
            if bot_id is None:
                bot_id = call("auth.test")["user_id"]
            msgs = call("conversations.replies",
                        channel=state["channel"], ts=state["ts"]).get("messages", [])
            for m in msgs[1:]:
                if is_human(m, bot_id) and float(m["ts"]) > float(state["last_ts"]):
                    state["answer"] = unescape(m["text"]); state["last_ts"] = m["ts"]
                    save(path, state)
                    print(f"ANSWER: {state['answer']}"); return
            delay = POLL  # a clean poll resets the backoff
        except Fatal as e:
            fail(f"fatal Slack error: {e}", 3)
        except Transient as e:
            hint = e.args[1] if len(e.args) > 1 else None
            print(f"transient: {e.args[0]}", file=sys.stderr)
            delay = hint if hint else min(delay * 2, 120)
        time.sleep(min(delay, max(0.0, deadline - time.monotonic())))
    fail(f"timeout: no reply after {timeout:.0f}s (state kept: {path}); "
         "stop and resume with `wait` later — do not guess", 2)

def cmd_reply(slug, text):
    path = state_path(slug)
    if not os.path.exists(path):
        fail(f"no thread for '{slug}' (run ask first)", 1)
    state = json.load(open(path))
    try:
        resp = call("chat.postMessage",
                    payload={"channel": state["channel"], "text": text, "thread_ts": state["ts"]})
    except (Transient, Fatal) as e:
        fail(f"post failed: {e.args[0]}", 3 if isinstance(e, Fatal) else 2)
    state["last_ts"] = resp["ts"]; state["answer"] = None
    save(path, state)
    print(f"replied ts={resp['ts']}")

def main(argv):
    usage = "usage: slack_qa.py ask <slug> <question> | wait <slug> [timeout-sec] | reply <slug> <text>"
    if len(argv) < 2:
        fail(usage, 1)
    cmd, args = argv[0], argv[1:]
    if cmd == "ask" and len(args) == 2:
        cmd_ask(args[0], args[1])
    elif cmd == "wait" and 1 <= len(args) <= 2:
        cmd_wait(args[0], float(args[1]) if len(args) == 2 else 1800.0)
    elif cmd == "reply" and len(args) == 2:
        cmd_reply(args[0], args[1])
    else:
        fail(usage, 1)

if __name__ == "__main__":
    main(sys.argv[1:])
