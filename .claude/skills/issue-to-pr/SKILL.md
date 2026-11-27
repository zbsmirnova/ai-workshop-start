---
name: issue-to-pr
description: Turn an issue (a title/description handed to the agent, e.g. labeled "Delegated to AI") into a pull request. If the issue leaves a decision open, ask the human in Slack first and wait for their reply in the thread before implementing. Use when asked to implement an issue, or given an issue-shaped task delegated to AI.
---

# issue-to-pr

Turn an issue into a merge-ready pull request, asking the issue author in Slack when the issue
leaves a decision open.

## Inputs

- The issue: title + body (from the prompt, or `gh issue view <n>` when the repo has issues enabled).
- Slack token: `SLACK_BOT_TOKEN` env var, or `~/.slack_token` (written by `.air/cloud/startup.sh`
  in Air cloud, where the secret does not reach the agent shell). The scripts check both and fail
  with a clear message when neither is set.
- Slack channel for questions: `ISSUE_TO_PR_CHANNEL` env var (required when asking).

## Workflow

1. **Understand the issue.** Read the relevant spec (`spec/`), memory (`memory/MEMORY.md`), and code.
   Decide what change the issue asks for.

2. **Detect open decisions.** An open decision is any choice the issue doesn't settle and that
   materially changes the result — ambiguous scope ("nicer", "better"), multiple reasonable designs,
   conflicting constraints, or missing acceptance criteria. Routine implementation choices
   (naming, file layout) are NOT open decisions — just use your judgment.

3. **Ask in Slack, wait for the reply.** If there is at least one open decision:
   - Pick a stable kebab-case slug for the issue (e.g. `make-the-skill-list-nicer`). **One slug =
     one question thread**; a second open decision on the same issue needs its own slug
     (e.g. `make-the-skill-list-nicer-2`).
   - Ask with `scripts/ask.sh <slug> "<question>"`: ONE concise message quoting the issue title,
     stating the question, and offering concrete options (A/B/C) so the human can answer in a word
     or two. The script posts once and persists the thread to `state/<slug>.json`; it **refuses to
     re-ask** when state exists, and when the local state is gone (fresh clone — `state/` is
     gitignored) it **recovers the thread from Slack** via the `[issue-to-pr:<slug>]` marker it
     embeds in the message. Recovery paginates history, verifies bot authorship, and resumes after
     the newest bot question. Notifications do not advance that boundary. A separate local lock
     serializes commands in one checkout; independent clones must not ask concurrently.
     Exit codes: 0 posted/recovered/cached, 1 usage or missing configuration, 2 transient
     error or busy lock (retry later), 3 fatal API error.
   - Wait with `scripts/wait-reply.sh <slug> [timeout-seconds]` (run it in the background): polls
     the thread for the first human reply newer than the bot's last question, retries transient
     network/rate-limit errors with backoff, fails fast on fatal ones (revoked token, bot removed),
     records the answer in the state file, and prints `ANSWER: <text>`. An already-recorded answer
     returns immediately. Exit codes: 0 answered, 1 usage/missing state or token, 2 timeout/transient/busy,
     3 fatal API error. Do NOT start implementing the ambiguous part before the answer.
   - **On any restart** (new session, fresh environment): just run `ask.sh` again with the same
     slug and question — it resumes (local state or Slack recovery) instead of re-posting — then
     `wait-reply.sh`.
   - If a reply raises new questions, continue **in the same thread** with
     `scripts/reply.sh <slug> "<follow-up>"`, then `wait-reply.sh` again — it waits for a reply
     newer than the follow-up.
   - **On timeout, stop — never guess.** The script checks once more for a reply, then posts
     one waiting notification per thread (recorded locally and recovered from Slack). It never
     advances the answer boundary, so replies arriving during the post still count.
     Leave the state pending, report "waiting on Slack", and end
     the run. The next run resumes with `wait-reply.sh`. (This is the AGENTS.md "never guess on
     open decisions" rule; there is no "conservative default" for a taste question.)

4. **Implement on a branch.** Branch off `main`, make the change, update `spec/` to match
   (per AGENTS.md), and add/adjust integration tests for every spec case touched.

5. **Verify.** `npm test` must pass (this includes `tests/issue-to-pr.test.ts`, which exercises
   these scripts against a fake Slack server). If the change affects the web view, run `npm run e2e`
   (accept intended pixel changes with `npm run e2e -- --update-snapshots`).

6. **Open the PR.** Push the branch, `gh pr create` with a summary that links the issue text and the
   Slack thread decision ("Per Slack: <answer>"). Attach a short video demo when the change is
   interactive (per AGENTS.md).

7. **Close the loop in Slack:** `scripts/reply.sh --notify <slug> "<PR link>"` (preserves the answer).

8. Run the `update-memory` skill after committing, per AGENTS.md.

## Known limitations (acceptable for now)

- Any human in the channel counts as the answerer — answers aren't restricted to the issue author.
- Only the first human message after a question counts; put the full decision in one message.
- Recovery requires the bot question and thread to remain in Slack history.
- Replies must be in the thread; channel-level answers and emoji reactions are not detected.
