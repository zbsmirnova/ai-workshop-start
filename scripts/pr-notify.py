#!/usr/bin/env python3
"""PR lifecycle notifications to Slack, one thread per PR. See spec/pr-notifications.md.

usage: pr-notify.py <opened|review|merged>
Event details come from the environment: PR_NUMBER, PR_TITLE, PR_URL, PR_AUTHOR;
REVIEW_AUTHOR, REVIEW_STATE, REVIEW_BODY (review); MERGED_BY (merged).
Credentials: SLACK_BOT_TOKEN or ~/.slack_token; destination: SLACK_CHANNEL_ID.
Exit codes: 0 delivered, 1 usage/missing configuration, 3 Slack API error.
"""
import json, os, sys, urllib.parse, urllib.request

API = os.environ.get("SLACK_API_BASE", "https://slack.com/api").rstrip("/")

def fail(msg, code):
    print(msg, file=sys.stderr); sys.exit(code)

def token():
    t = os.environ.get("SLACK_BOT_TOKEN")
    if not t:
        path = os.path.expanduser("~/.slack_token")
        if os.path.isfile(path):
            t = open(path).read().strip()
    if not t:
        fail("no Slack token: set SLACK_BOT_TOKEN or provide ~/.slack_token", 1)
    return t

def call(method, payload=None, **params):
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
    except OSError as e:
        fail(f"{method}: {e}", 3)
    if not d.get("ok"):
        fail(f"{method}: {d.get('error', 'unknown')}", 3)
    return d

def esc(text):
    return " ".join(str(text).splitlines()).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def env(name, required=True):
    value = os.environ.get(name, "")
    if required and not value:
        fail(f"missing {name}", 1)
    return value

def marker(number):
    return f"[pr:{number}]"

def find_root(channel, number):
    """The ts of the bot message carrying the PR's marker, in recent history; else None."""
    history = call("conversations.history", channel=channel, limit=200)
    for m in history.get("messages", []):
        if marker(number) in m.get("text", "") and m.get("ts"):
            return m["ts"]
    return None

def post(channel, text, thread_ts=None):
    payload = {"channel": channel, "text": text, "parse": "none",
               "unfurl_links": False, "unfurl_media": False}
    if thread_ts:
        payload["thread_ts"] = thread_ts
    return call("chat.postMessage", payload=payload)

def main(argv):
    if len(argv) != 1 or argv[0] not in ("opened", "review", "merged"):
        fail("usage: pr-notify.py <opened|review|merged>", 1)
    event = argv[0]
    channel = env("SLACK_CHANNEL_ID")
    number = env("PR_NUMBER")

    if event == "opened":
        text = (f"PR #{number} opened by {esc(env('PR_AUTHOR'))}: {esc(env('PR_TITLE'))}\n"
                f"{env('PR_URL')}\n{marker(number)}")
        resp = post(channel, text)
    else:
        if event == "review":
            state = env("REVIEW_STATE").lower()
            icon, verb = {"approved": ("✅", "approved"),
                          "changes_requested": ("❌", "requested changes on")}.get(state, ("💬", "reviewed"))
            text = f"{icon} {esc(env('REVIEW_AUTHOR'))} {verb} #{number}"
            body = os.environ.get("REVIEW_BODY", "").strip()
            if body:
                first = body.splitlines()[0]
                text += f"\n> {esc(first[:200])}"
        else:
            text = f"🟣 #{number} merged by {esc(env('MERGED_BY'))}"
        root = find_root(channel, number)
        if root:
            resp = post(channel, text, thread_ts=root)
        else:  # no root in the search window: become the thread root, keep the event
            resp = post(channel, f"{text}\n{env('PR_URL')}\n{marker(number)}")
    print(f"delivered ts={resp['ts']}")

if __name__ == "__main__":
    main(sys.argv[1:])
