# QA automation

## Repository routing for all automations

Select **`zbsmirnova/ai-workshop-start`** as the repository for QA, repair, review, and merge
automations, with **`main`** as the base branch. The parent repository
`ndkoval/ai-workshop-start` is not the target. Configure any repair integration to create its
PR in this same fork. Repository instructions cannot change an integration's saved target.

Include this in each saved automation prompt (including **Fix the review and/or merge**):

> Read and follow `AGENTS.md`. Work only in `zbsmirnova/ai-workshop-start`, with PR base `main`.
> Run `gh repo set-default zbsmirnova/ai-workshop-start` in each fresh checkout and pass
> `--repo zbsmirnova/ai-workshop-start` to every `gh pr`, `gh issue`, and `gh run` command.
> Use explicit `repos/zbsmirnova/ai-workshop-start/...` paths for repository-scoped API calls.
> Verify the push remote is the fork before pushing. When creating a PR, explicitly pass
> `--repo zbsmirnova/ai-workshop-start --base main --head <branch>`.
> Read back the created PR. Before review or merge, verify the PR URL belongs to
> `https://github.com/zbsmirnova/ai-workshop-start/pull/` and its base is `main`.
> Report a mismatched repository or base instead of acting on it. Keep the existing review,
> test, and merge authorization requirements.

These are saved-prompt instructions, not a registered automation update. Apply them to the
saved automations in Air as well as selecting the fork in their repository settings.

Manual routing acceptance: in a fresh automation checkout, confirm `gh repo set-default --view`
identifies `zbsmirnova/ai-workshop-start`. For the next authorized fix PR, verify its
URL and base with `gh pr view <number> --repo zbsmirnova/ai-workshop-start --json url,baseRefName`.
An event pointing to the parent repository must be reported without review or merge there.

## Daily QA

One Air automation runs scripted QA and then exploratory red-agent checks against the same
checked-out `main` commit. Update the existing daily QA automation, or create it in Air if absent,
and use **Run Now** to try it. If a separate daily red-agent automation was previously registered,
disable its schedule when enabling this combined run to avoid duplicate daily exploration.

- **Name:** Daily QA + red agent — Skill Atlas web view
- **Schedule:** once per day, 07:00 UTC (so a regression report is waiting in the morning)
- **Repository:** `zbsmirnova/ai-workshop-start`
- **Branch:** `main`

Prompt:

> Read `AGENTS.md`, `memory/MEMORY.md`, and `spec/`. Work only in
> `zbsmirnova/ai-workshop-start`. Set it as the GitHub CLI default and explicitly select it
> in all GitHub operations. Start from the current `main`, record its commit, and keep both
> phases on that commit.
>
> First follow `.claude/skills/manual-qa/SKILL.md`: run the numbered test scripts described
> in `qa/README.md`, record each run, and produce `qa-report.md` with PASS/FAIL/BLOCKED per
> script and video evidence. Documentation such as this automation recipe is not a test script.
>
> - If every scripted check passes, continue to the red-agent phase; do not finish early.
> - For **each failing script**: open a GitHub issue (`gh issue create --repo zbsmirnova/ai-workshop-start`) titled
>   `QA failure: <script id> — <script title>` labeled `qa`, unless an *open* issue with that title
>   already exists (`gh issue list --repo zbsmirnova/ai-workshop-start --state open --label qa`) — then add a comment with the new run's
>   result instead. The issue body: the failing step, **expected vs. observed** (one sentence each),
>   the checkpoint screenshot, how to reproduce (the `qa/<id>.md` script), and the name of the video
>   artifact (`manual-qa/videos/<id>.webm`) from this run's session artifacts.
> - A driver/setup problem (browser missing, server did not start) is not a product failure: report
>   it as `⚠ BLOCKED` in the summary and do not open a product issue for it.
> - If a previously-failing script now passes and its `qa` issue is open, comment that it passed on
>   this run with a link to the report — do not close it yourself.
>
> Then follow `.agents/skills/red-agent/SKILL.md` on the same commit, even if scripted checks
> found product bugs. Explore beyond the scripts for at most 20 minutes or three distinct
> confirmed bugs, whichever comes first. Reproduce each candidate twice and save the video,
> screenshot, and reproduction driver. If setup prevents exploration, mark this phase BLOCKED.
>
> Deduplicate against all existing open issues and issues filed in the scripted phase. For
> the same root cause, add materially new evidence to the existing issue and apply
> `Delegated to AI` rather than opening a duplicate. File new confirmed exploratory bugs
> with that exact label. Do not modify application code, push fixes, or merge PRs in this run.
>
> If Issues or permissions are unavailable, preserve complete issue drafts and evidence in
> session artifacts and report the filing blocker. Do not enable repository features or
> claim that issues were filed. Report repair PRs only when actually observed.
>
> Finish with one combined summary: tested commit, scripted results, exploratory coverage,
> confirmed bugs, issue and evidence links, and blockers. If both phases pass with no bugs,
> report that briefly and open no issues. Finalize recordings and stop servers started by
> this run. Keep reports and recordings in durable session artifacts.

## Why this shape

- **One issue per failing script**, deduplicated by title — reruns comment instead of piling up
  duplicates.
- **Videos stay session artifacts** (they are large and ephemeral); the issue carries the
  screenshot and points at the run for the video.
- **PASS runs are silent** apart from the report — both phases must finish before reporting success.

## Red-agent prerequisites and acceptance

The red agent is the second phase of the daily QA automation above, not a PR-review step.
This document is a setup recipe, not a registered automation. Both referenced skills must be
available on the selected branch.

Prerequisites: enabled GitHub Issues, issue-write access, accessible video artifacts, and an
installed repair integration watching the exact **Delegated to AI** label. Verify the integration
actually opens a fix PR; applying a label alone does not provide that behavior. Each run reads
back the issues it filed and reports issue URLs and any observed fix PRs.

Manual acceptance: use **Run Now** and verify that the report contains both scripted QA and
exploratory coverage for the same commit, a passing scripted phase does not skip exploration,
duplicate findings reuse an issue, and unavailable issue filing produces drafts with a blocker.
