#!/usr/bin/env python3
"""Derive a stable thread identity from a GitHub issue URL and decision round."""
import hashlib
import re
import sys

if not 2 <= len(sys.argv) <= 3:
    sys.exit("usage: issue-slug.py <github-issue-url> [decision-round]")
match = re.fullmatch(r"https://github\.com/([^/]+)/([^/]+)/issues/([1-9][0-9]*)/?", sys.argv[1])
round_id = sys.argv[2] if len(sys.argv) == 3 else "1"
if not match or not re.fullmatch(r"[1-9][0-9]*", round_id):
    sys.exit("provide a GitHub issue URL and a positive decision round")
owner, repo, number = match.groups()
identity = f"https://github.com/{owner.lower()}/{repo.lower()}/issues/{number}"
print(f"issue-{hashlib.sha256(identity.encode()).hexdigest()}-{round_id}")
