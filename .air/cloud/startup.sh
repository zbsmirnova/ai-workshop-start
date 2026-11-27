#!/usr/bin/env bash
# Air cloud workspace setup script.
# Captures shared secrets from the setup environment into the home dir,
# since they are not propagated into the agent process environment.
if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
  umask 077
  printf '%s' "$SLACK_BOT_TOKEN" > "$HOME/.slack_token"
fi
