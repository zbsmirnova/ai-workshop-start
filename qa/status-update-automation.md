# Status update in Air Cloud

Create an automation in Air for this repository with these settings:

- Name: `Status update — Skill Atlas`
- Branch: the branch containing `.agents/skills/status-update/SKILL.md` (use `main` once merged).
- Suggested schedule: daily at 09:00 UTC; confirm the user's preferred cadence before enabling.
- Prompt: `Follow instructions from .agents/skills/status-update/SKILL.md.`
- Environment secret: `SLACK_BOT_TOKEN`.
- Environment: `SLACK_CHANNEL_ID`, identifying the user's private channel.
- Optional first-run input: `STATUS_UPDATE_SINCE`, an ISO 8601 timestamp with timezone.

Invite the bot to the private channel and grant `groups:read` and `chat:write`. GitHub read
authentication must also be available in the automation environment. Never include the bot
token in the prompt or commit it to the repository.

The default window is the preceding 24 hours. If Air supplies durable checkpoint inputs,
pass the previous successful end timestamp instead. Remove a fixed first-run start before
enabling rolling reports, or every report will be cumulative. A rolling window can miss
activity after a delayed or skipped run.

Select **Run Now** once configuration is complete. Compare the linked GitHub items with the
window, verify the private-channel message and returned Slack receipts, and check that no
entries are omitted. Use previews for polishing to avoid duplicate test posts.

This file is a setup recipe. It does not create, enable, or run an Air automation.
