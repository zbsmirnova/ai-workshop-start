#!/usr/bin/env python3
"""Slack Q&A for the issue-to-pr skill.

Subcommands:
  ask <slug> <question>        Post the question once; recover state from Slack if the local
                               state file is missing (fresh clone). Tags the message with
                               [issue-to-pr:<slug>] so it can be found again.
  wait <slug> [timeout-sec]    Wait for a human reply newer than the last bot question in the
                               thread; record it in the state file and print "ANSWER: <text>".
  reply [--notify] <slug> <text> Post a follow-up into the thread; future `wait` calls then wait
                               for a reply newer than this follow-up. --notify preserves the decision.

Environment:
  SLACK_BOT_TOKEN              Token; falls back to ~/.slack_token (written by .air/cloud/startup.sh,
                               since Air cloud does not propagate the secret to the agent shell).
  ISSUE_TO_PR_CHANNEL          Channel ID for questions (required for ask).
  ISSUE_TO_PR_STATE_DIR        State directory (default: <skill>/state).
  ISSUE_TO_PR_POLL_INTERVAL    Base poll interval in seconds (default: 30).
  SLACK_API_BASE               API base URL (default: https://slack.com/api); for tests.

Exit codes: 0 answered/ok, 1 usage, missing state or missing token, 2 timeout/transient/busy, 3 fatal API error.
"""
import fcntl, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

API = os.environ.get("SLACK_API_BASE", "https://slack.com/api").rstrip("/")
CHANNEL = os.environ.get("ISSUE_TO_PR_CHANNEL")
STATE_DIR = os.environ.get(
    "ISSUE_TO_PR_STATE_DIR",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "state"))
POLL = float(os.environ.get("ISSUE_TO_PR_POLL_INTERVAL", "30"))
# Only known temporary failures may be resumed automatically.
TRANSIENT = {"ratelimited", "rate_limited", "internal_error", "service_unavailable", "request_timeout"}
NOTIFY = "[issue-to-pr:notification]"
NUDGE = "Still waiting on this decision before implementing."

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
        if e.code != 429 and not 500 <= e.code < 600:
            raise Fatal(f"{method}: HTTP {e.code}")
        retry = e.headers.get("Retry-After")
        raise Transient(f"{method}: HTTP {e.code}" + (f" (retry-after {retry}s)" if retry else ""),
                        float(retry) if retry else None)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
        raise Transient(f"{method}: {e}", None)
    if not d.get("ok"):
        err = d.get("error", "unknown")
        if err not in TRANSIENT:
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

def load(path):
    try:
        with open(path) as f:
            state = json.load(f)
        if not isinstance(state, dict) or not all(state.get(k) for k in ("channel", "ts")):
            return None
        float(state["ts"])
        float(state.get("last_ts", state["ts"]))
        return state
    except (OSError, ValueError, TypeError):
        return None

def messages(method, **params):
    cursor = ""
    while True:
        page = call(method, limit=200, cursor=cursor, **params)
        yield from page.get("messages", [])
        cursor = page.get("response_metadata", {}).get("next_cursor", "")
        if not cursor:
            return

def posted(payload):
    resp = call("chat.postMessage", payload=payload)
    if not resp.get("ts"):
        raise Fatal("chat.postMessage: missing ts; run ask to recover from Slack before retrying")
    return resp

def cmd_ask(slug, question):
    path = state_path(slug)
    state = load(path)
    if state:
        print("already-asked"); print(json.dumps(state, indent=2)); return
    if not CHANNEL:
        fail("set ISSUE_TO_PR_CHANNEL before asking", 1)
    bot_id = call("auth.test")["user_id"]
    for m in messages("conversations.history", channel=CHANNEL):
        if marker(slug) in m.get("text", "") and m.get("ts") and m.get("user") == bot_id:
            thread = list(messages("conversations.replies", channel=CHANNEL, ts=m["ts"]))
            bot_questions = [r["ts"] for r in thread if r.get("user") == bot_id
                             and NOTIFY not in r.get("text", "")]
            state = {"issue": slug, "channel": CHANNEL, "ts": m["ts"],
                     "last_ts": max([m["ts"]] + bot_questions, key=float),
                     "question": m["text"], "answer": None, "recovered": True,
                     "nudged": any(r.get("user") == bot_id and
                                   r.get("text") == f"{NUDGE}\n{NOTIFY}" for r in thread)}
            save(path, state)
            print("recovered-from-slack"); print(json.dumps(state, indent=2)); return
    text = f"{question}\n_{marker(slug)}_"
    resp = posted({"channel": CHANNEL, "text": text})
    state = {"issue": slug, "channel": CHANNEL, "ts": resp["ts"], "last_ts": resp["ts"],
             "question": text, "answer": None, "nudged": False}
    save(path, state)
    print(f"asked ts={resp['ts']} state={path}")

def poll(state, path, bot_id):
    for m in messages("conversations.replies", channel=state["channel"], ts=state["ts"]):
        if is_human(m, bot_id) and float(m["ts"]) > float(state["last_ts"]):
            state["answer"] = unescape(m["text"]); state["last_ts"] = m["ts"]
            save(path, state)
            print(f"ANSWER: {state['answer']}")
            return True
    return False

def cmd_wait(slug, timeout):
    path = state_path(slug)
    state = load(path)
    if state is None:
        fail(f"no pending question for '{slug}' (run ask first)", 1)
    state.setdefault("last_ts", state["ts"])  # state written before follow-up support
    if state.get("answer"):
        print(f"ANSWER: {state['answer']}"); return
    deadline = time.monotonic() + timeout
    delay, bot_id = POLL, None
    while time.monotonic() < deadline:
        try:
            if bot_id is None:
                bot_id = call("auth.test")["user_id"]
            if poll(state, path, bot_id):
                return
            delay = POLL  # a clean poll resets the backoff
        except Fatal as e:
            fail(f"fatal Slack error: {e}", 3)
        except Transient as e:
            hint = e.args[1] if len(e.args) > 1 else None
            print(f"transient: {e.args[0]}", file=sys.stderr)
            delay = hint if hint else min(delay * 2, 120)
        time.sleep(min(delay, max(0.0, deadline - time.monotonic())))
    # Final poll, then a notification that never advances the answer boundary.
    if bot_id is None:
        bot_id = call("auth.test")["user_id"]
    if poll(state, path, bot_id):
        return
    if not state.get("nudged"):
        posted({"channel": state["channel"], "thread_ts": state["ts"],
                "text": f"{NUDGE}\n{NOTIFY}"})
        state["nudged"] = True
        save(path, state)
    fail(f"timeout: no reply after {timeout:.0f}s (state kept: {path}); "
         "stop and resume with `wait` later — do not guess", 2)

def cmd_reply(slug, text, notify=False):
    path = state_path(slug)
    state = load(path)
    if state is None:
        fail(f"no thread for '{slug}' (run ask first)", 1)
    try:
        resp = posted({"channel": state["channel"],
                       "text": f"{text}\n{NOTIFY}" if notify else text, "thread_ts": state["ts"]})
    except (Transient, Fatal) as e:
        fail(f"post failed: {e.args[0]}", 3 if isinstance(e, Fatal) else 2)
    if not notify:
        state["last_ts"] = resp["ts"]; state["answer"] = None
    save(path, state)
    print(f"replied ts={resp['ts']}")

def main(argv):
    usage = "usage: slack_qa.py ask <slug> <question> | wait <slug> [timeout-sec] | reply [--notify] <slug> <text>"
    if len(argv) < 2:
        fail(usage, 1)
    cmd, args = argv[0], argv[1:]
    if cmd == "ask" and len(args) == 2:
        cmd_ask(args[0], args[1])
    elif cmd == "wait" and 1 <= len(args) <= 2:
        cmd_wait(args[0], float(args[1]) if len(args) == 2 else 1800.0)
    elif cmd == "reply" and len(args) == 3 and args[0] == "--notify":
        cmd_reply(args[1], args[2], notify=True)
    elif cmd == "reply" and len(args) == 2:
        cmd_reply(args[0], args[1])
    else:
        fail(usage, 1)

if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) < 2:
        main(args)
    slug = args[2] if args[0:2] == ["reply", "--notify"] and len(args) > 2 else args[1]
    # Kernel lock is released on process death; never unlink this shared lock inode.
    with open(state_path(slug).removesuffix(".json") + ".lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fail("thread busy; retry later", 2)
        try:
            main(args)
        except Fatal as e:
            fail(f"fatal Slack error: {e}", 3)
        except Transient as e:
            fail(f"transient Slack error; retry later: {e.args[0]}", 2)
