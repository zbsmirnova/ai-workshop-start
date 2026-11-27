---
name: perf-budget-test-flakes-on-ci
description: The 5-second pair-grouping perf test can exceed its budget on slow GitHub runners — a red CI on main is not necessarily a regression
metadata:
  type: gotcha
  date: 2026-11-27
---

The test `large pair corpus groups within a practical server budget` asserts pair grouping
finishes within five seconds. On 2026-11-27 it took 6.3 s on a GitHub-hosted runner and failed
the CI run on `main` (run 45997363474) right after merge #16, while the same suite passes
locally in a fraction of the budget.

**Why:** Wall-clock budgets measure the runner, not the code; GitHub-hosted runners vary a lot.
It cost a detour during the demo-video task to confirm the red main was not a real regression.
**How to apply:** Before treating a red `main` as a regression, check whether this test is the
only failure and how far over budget it went. If it flakes again, consider raising the budget
on CI or asserting on operation counts instead of wall time.
