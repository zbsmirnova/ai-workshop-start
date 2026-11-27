# PR notifications

Slack notifications for this repository's pull requests: one thread per PR, holding its whole
lifecycle — opened, reviews, merged.

## Events

- **Opened** (and **reopened**): a channel message, the PR's thread root:
  `PR #<number> opened by <author>: <title>` followed on its own line by the PR URL, and a final
  line with the marker `[pr:<number>]` (the thread key).
- **Review submitted**: a reply in that PR's thread: `<state icon> <reviewer> <verb> #<number>`,
  with an optional first line of the review body. States: `approved` → ✅ approved,
  `changes_requested` → ❌ requested changes, anything else → 💬 reviewed.
- **Merged**: a reply in the thread: `🟣 #<number> merged by <merged-by>`.
- A PR **closed without merging** sends nothing.

## Threading

- The thread root is found by searching the channel's recent history (up to the latest 200
  messages) for the bot's message containing `[pr:<number>]` — Slack is the source of truth;
  nothing is stored locally.
- When no root is found (the PR predates the notifier, or the root left the search window), the
  event is **not dropped**: it is posted as a new channel message that carries the marker, and so
  becomes the thread root for later events.

## Delivery

- `scripts/pr-notify.py <opened|review|merged>` reads the event details from environment
  variables (`PR_NUMBER`, `PR_TITLE`, `PR_URL`, `PR_AUTHOR`; `REVIEW_AUTHOR`, `REVIEW_STATE`,
  `REVIEW_BODY` for reviews; `MERGED_BY` for merges), never from command arguments.
- The Slack token comes from `SLACK_BOT_TOKEN`, else `~/.slack_token`; the channel from
  `SLACK_CHANNEL_ID`. A missing token, channel, or `PR_NUMBER` → a clear message, exit code 1.
- Titles and names are Slack-escaped (`&`, `<`, `>`) and posted with `parse: none`, no unfurling.
- An API response without `ok: true` → the error on stderr, exit code 3; success prints the
  message `ts` receipt.
- The GitHub Actions workflow `pr-notify.yml` invokes the script on `pull_request`
  (opened, reopened, closed-and-merged) and `pull_request_review` (submitted), passing the event
  fields through the environment. It becomes active once it exists on the default branch.
