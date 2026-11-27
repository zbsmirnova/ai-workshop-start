# Slack Q&A: state recovery and token propagation

## Air cloud doesn't pass SLACK_BOT_TOKEN to the agent shell
The shared secret is visible only to the setup environment; `.air/cloud/startup.sh` captures it
into `~/.slack_token`. Anything needing the token must check the env var *and* that file
(`issue-to-pr/scripts/slack_qa.py` does).

## Gitignored state doesn't survive headless runs — Slack is the source of truth
`issue-to-pr`'s `state/` is gitignored (transient Q&A), so every fresh clone (each Air automation
run) starts empty. Rather than committing state, each question embeds an `[issue-to-pr:<slug>]`
marker and `ask` rebuilds state from `conversations.history`. If you add similar tooling, don't
rely on the working copy persisting between runs.

## Thread polling gotcha
A naive `set -e` + urllib poll loop dies on the first network blip and can't distinguish
"revoked token" from "timeout". Separate exit codes (2 timeout / 3 fatal) and retry transient
errors with backoff; also only count replies with a `user`, no `bot_id`, an allowed human subtype (including `thread_broadcast`), and a
`ts` newer than the bot's last thread message.
