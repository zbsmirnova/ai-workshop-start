# Exploratory red agent

The project skill `.claude/skills/red-agent/SKILL.md` explores the local web view against the
product specs. Each distinct confirmed bug gets a reproducible GitHub issue with steps,
expected/actual behavior, video evidence, and the exact label `Delegated to AI`. Duplicate bugs
reuse existing issues. Setup failures are reported separately and are never product bugs.

The run reads filed issues back. The Air repair automation described in `qa/automation.md`, once installed, consumes the label
and opens a fix PR; the red agent reports only PRs it actually observes. Missing integrations
or permissions leave evidence and issue drafts with an explicit blocked status.

`qa/automation.md` provides the Air automation settings. Saving that recipe does not register
or run an automation. Manual acceptance: invoke the skill, reproduce a genuine bug from its
issue and video, and verify a linked fix PR from the configured repair integration.

Acceptance status: not yet run end to end. Issues are disabled and no repair automation
installation URL has been recorded. Do not treat passing product tests as evidence of this handoff.
