# QA automation

The Air automation that replaces the manual QA round. Create it in Air (Automations → New),
schedule it (e.g. daily, or on pushes to `main`), and use **Run Now** to try it. Prompt:

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

## Why this shape

- **One issue per failing script**, deduplicated by title — reruns comment instead of piling up
  duplicates.
- **Videos stay session artifacts** (they are large and ephemeral); the issue carries the
  screenshot and points at the run for the video.
- **PASS runs are silent** apart from the report — the automation only makes noise on regressions.
