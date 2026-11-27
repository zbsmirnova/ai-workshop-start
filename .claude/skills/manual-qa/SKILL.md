---
name: manual-qa
description: "Run the manual QA scripts in qa/ against the web view in a real browser \u2014 follow each script's steps, verify checkpoints on screenshots, and report PASS or FAIL per script with a screen recording. Use when asked to run QA, manual QA, or to check the web UI. Optional argument: one script id (e.g. 02-live-filter) to run only that script."
---

# Manual QA

You are the manual tester. Follow each script in `qa/` in a real browser, judge every checkpoint
by **looking at the screen**, and report PASS or FAIL per script — always with a video of the run.

## Setup

1. `npm ci` if `node_modules/` is missing.
2. Playwright: `npm ls playwright || npm i --no-save playwright`. Browser: use
   `/opt/browsers/chrome-linux/chrome` as `executablePath` if it exists. If not, install it —
   `npx playwright install --with-deps chromium` when Playwright's CDN is reachable; otherwise
   (this environment blocks it) download a Chromium snapshot, which is reachable:
   ```bash
   REV=$(curl -s https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/LAST_CHANGE)
   sudo mkdir -p /opt/browsers && cd /opt/browsers
   sudo curl -sO "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/$REV/chrome-linux.zip"
   sudo apt-get install -y unzip && sudo unzip -q chrome-linux.zip
   sudo apt-get install -y libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 \
     libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 \
     libcairo2 libasound2t64 libatspi2.0-0t64 fonts-liberation
   ```
   Launch with `--no-sandbox` when running as root.
3. Start the app in the background: `./skill-atlas serve --port 4173`, wait until
   `curl -sf http://localhost:4173` succeeds. Stop it when done.
4. Artifacts go to `$AIR_ARTIFACTS_DIR/manual-qa/` (fall back to `./.qa-artifacts/` without the
   env var): `videos/`, `shots/`, and `qa-report.md`.

## Running a script

Scripts are the numbered `qa/[0-9][0-9]-*.md` files with `id` and `title` front matter (exclude process documents such as `README.md`, `automation.md`, and `red-agent.md`); run them in filename order, or only the one matching
the argument. `qa/README.md` holds the shared conventions — read it first. For each script:

1. Read the script. Write a small Node driver (in a temp dir, not the repo) using Playwright that:
   - creates a **fresh browser context** with `recordVideo: { dir: <videos tmp>, size: { width: 1280, height: 800 } }`
     and viewport 1280×800;
   - performs the steps exactly as written, as a careful human would — type into fields (use
     `pressSequentially` where a script says "as you type"), click buttons, follow waits implied
     by the text; never call the API directly or shortcut a step;
   - after **every checkpoint** saves `shots/<script-id>-step<N>.png` (full page);
   - on a driver-level surprise (missing element, timeout) still saves a screenshot, closes the
     context cleanly so the video is written, and reports which step broke;
   - closes the context at the end and renames the video to `videos/<script-id>.webm`.
2. **Judge every checkpoint yourself**: Read each screenshot and compare it with the script's
   *Expect* line. Verify visually — legibility, placement, "shown as text not HTML" — not merely
   that a string exists in the DOM. Where the expectation is about the address bar, have the
   driver record `page.url()` alongside the screenshot.
3. Verdict for the script: **PASS** only if every checkpoint held. Otherwise **FAIL** at the first
   failing step, with expected vs. observed in one sentence each.

A broken driver is not a product failure: if a step fails, re-check your driver against the page
once before concluding FAIL. But do not weaken an expectation to make it pass — the scripts and
`spec/` are the truth; a mismatch with them is a FAIL.

## Report

Write `qa-report.md` in the artifacts dir:

```markdown
# Manual QA — <date>, commit <short-sha>

| Script | Result | Video |
| --- | --- | --- |
| 01-scan-local-repo — Scan a local repository | ✅ PASS | videos/01-scan-local-repo.webm |
| 02-live-filter — Live, client-side filtering | ❌ FAIL (step 3) | videos/02-live-filter.webm |

## Failures
### 02-live-filter, step 3
- **Expected:** header `fixture · 0 of 3 skills`, no error.
- **Observed:** header kept `fixture · 1 of 3 skills` after clearing to no matches.
- Screenshot: shots/02-live-filter-step3.png — Video: videos/02-live-filter.webm
```

Every script row links its video — passes included. Finish the chat reply with just the summary
table and, if anything failed, the one-line expected/observed per failure. Do not paste raw driver
logs.
