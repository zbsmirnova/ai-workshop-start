# QA automation

The Air automation that replaces the manual QA round. Create it in Air (Automations → New) and
use **Run Now** to try it.

- **Name:** Daily manual QA — Skill Atlas web view
- **Schedule:** once per day, 07:00 UTC (so a regression report is waiting in the morning)
- **Branch:** `main`

Prompt:

> Run the `manual-qa` skill on the current `main`: follow every script in `qa/`, record each run,
> and produce `qa-report.md` with PASS/FAIL per script and a video for every script.
>
> - If **everything passes**: reply with just the summary table; do not open any issue.
> - For **each failing script**: open a GitHub issue (`gh issue create`) titled
>   `QA failure: <script id> — <script title>` labeled `qa`, unless an *open* issue with that title
>   already exists (`gh issue list --state open --label qa`) — then add a comment with the new run's
>   result instead. The issue body: the failing step, **expected vs. observed** (one sentence each),
>   the checkpoint screenshot, how to reproduce (the `qa/<id>.md` script), and the name of the video
>   artifact (`manual-qa/videos/<id>.webm`) from this run's session artifacts.
> - A driver/setup problem (browser missing, server did not start) is not a product failure: report
>   it as `⚠ BLOCKED` in the summary and do not open a product issue for it.
> - If a previously-failing script now passes and its `qa` issue is open, comment that it passed on
>   this run with a link to the report — do not close it yourself.

## Why this shape

- **One issue per failing script**, deduplicated by title — reruns comment instead of piling up
  duplicates.
- **Videos stay session artifacts** (they are large and ephemeral); the issue carries the
  screenshot and points at the run for the video.
- **PASS runs are silent** apart from the report — the automation only makes noise on regressions.

## Red agent

Separate exploratory automation, using the same daily cadence as the QA round:

- **Name:** Red agent — Skill Atlas web view
- **Schedule:** daily at 07:00 UTC
- **Branch:** `main`
- **Prompt:** `Follow instructions from .agents/skills/red-agent/SKILL.md.`

Create this in Air → Automations → New, then select **Run Now**. This document is a setup
recipe, not a registered automation. The skill must be available on the selected branch.

Prerequisites: enabled GitHub Issues, issue-write access, accessible video artifacts, and an
installed repair integration watching the exact **Delegated to AI** label. Verify the integration
actually opens a fix PR; applying a label alone does not provide that behavior. Each run reads
back the issues it filed and reports issue URLs and any observed fix PRs.
