# Manual QA scripts

Standard test scripts for the [web view](../spec/web.md). Each script is written for a tester —
human or agent — driving a real browser: numbered steps, and after each step what the tester
**should see** on the screen (not in the page source).

## Conventions

- **App under test**: `./skill-atlas serve --port 4173` from the repository root, then
  `http://localhost:4173`.
- **Test repository**: the local [`fixture/`](../fixture/README.md) directory. Scanning it shows
  `fixture · 3 skills` (`code-style`, `commits`, `release-checklist`) and one warning about
  `release-checklist`'s malformed front matter. Use the absolute path to the directory in the
  repository field.
- Every *Expect:* line is a checkpoint: verify it visually before moving on. Any checkpoint that
  does not hold fails the script at that step.
- Each script starts from a fresh page (no leftover URL parameters) unless its steps say otherwise.

## Format

```markdown
---
id: NN-slug
title: One line
preconditions: anything beyond the conventions above
---
1. Step. **Expect:** what you should see.
```

## Result

A script run ends **PASS** or **FAIL**, always with a screen recording of the run. A failure names
the step, the expectation, and what was actually observed.

## Deterministic twin

Each script is also encoded as a deterministic Playwright test in [`e2e/`](../e2e) (`npm run e2e`):
same fixture, fixed viewport and fonts, a video of every run, and pixel-exact screenshot baselines
in `e2e/screenshots` compared on CI. The agent-driven skill stays for exploratory judgment; the e2e
suite is the regression gate.
