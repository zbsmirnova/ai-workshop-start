# Status-update skill

`.agents/skills/status-update/SKILL.md` reports this repository's merged PRs and currently
completed, closed issues during an explicit timezone-aware `[start, end)` window. Without a
start input it uses the preceding 24 hours and labels that window. All GitHub pages must be
read successfully. Not-planned, duplicate, reopened, and unknown-reason issues are excluded.
When GitHub Issues is disabled, report that explicitly and omit the resolved-issue count;
continue collecting PRs without enabling Issues or claiming an empty resolved-issue result.

Reports contain counts, separate sections, linked titles, and explicit empty results. Source
titles cannot inject Slack mentions. Long reports are split without losing entries. Posting
uses `SLACK_BOT_TOKEN` and a configured private channel ID, verifies private-channel membership,
and checks Slack's API success and message receipts. Missing inputs or failed collection do
not cause a partial or misdirected post. Ambiguous delivery stops retries; confirmed partial
delivery is reported. Previews never post. Checkpoints advance only after complete delivery.

This is an agent workflow, not an application endpoint. Manual integration acceptance: run
against GitHub for a known window, compare included/excluded items and counts, then run with
a configured Slack bot and verify message receipts and channel contents. Exercise an empty
window and missing credentials as well. A live Slack run requires the environment secret and
channel ID; a preview alone does not satisfy delivery acceptance.

`qa/status-update-automation.md` holds the Air setup recipe. Saving it does not register an
automation; registration and Run Now must be confirmed by Air.
