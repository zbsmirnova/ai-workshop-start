# Exploratory red agent

The project skill `.agents/skills/red-agent/SKILL.md` explores the local web view against the
product specs. Each distinct confirmed bug gets a reproducible GitHub issue with steps,
expected/actual behavior, video evidence, and the exact label `Delegated to AI`. Duplicate bugs
reuse existing issues. Setup failures are reported separately and are never product bugs.

Automation issues and repair PRs target the fork `zbsmirnova/ai-workshop-start`; repair PRs
use base `main`. GitHub operations explicitly select that repository. Fresh checkouts also
set it as the GitHub CLI default. Created PRs are read back; review and merge operations
verify the PR URL's repository and base branch before acting. A parent-repository event
is reported without acting on that PR. See `AGENTS.md` and `qa/automation.md` for the routing
instructions and manual acceptance checks.

The run reads filed issues back. A configured external repair integration consumes the label
and opens a fix PR; the red agent reports only PRs it actually observes. Missing integrations
or permissions leave evidence and issue drafts with an explicit blocked status.

`qa/automation.md` provides the Air automation settings. Saving that recipe does not register
or run an automation. Daily QA runs at 07:00 UTC on the fork's `main`: scripted manual QA first,
then the red-agent skill on the same commit, outside PR review. Scripted success does not skip
exploration. Exploration stops at 20 minutes or three confirmed bugs. Both phases share issue
deduplication and one summary; unavailable issue filing preserves drafts and reports a blocker.
The combined schedule replaces any separately registered daily red-agent schedule.

Manual acceptance: invoke the skill, reproduce a genuine bug from its
issue and video, and verify a linked fix PR from the configured repair integration.
