---
name: issue-to-pr
description: Turn an issue (a title/description handed to the agent, e.g. labeled "Delegated to AI") into a pull request. If the issue leaves a decision open, ask the human in Slack first and wait for their reply in the thread before implementing. Use when asked to implement an issue, or given an issue-shaped task delegated to AI.
---

# issue-to-pr

Turn an issue into a merged-ready pull request, asking the issue author in Slack when the issue
leaves a decision open.

## Inputs

- The issue: title + body (from the prompt, or `gh issue view <n>` when the repo has issues enabled).
- `SLACK_BOT_TOKEN` (environment secret) — Slack bot token for asking questions.
- Slack channel for questions: `C0CN90V19L0` (#zina-workshop-test).

## Workflow

1. **Understand the issue.** Read the relevant spec (`spec/`), memory (`memory/MEMORY.md`), and code.
   Decide what change the issue asks for.

2. **Detect open decisions.** An open decision is any choice the issue doesn't settle and that
   materially changes the result — ambiguous scope ("nicer", "better"), multiple reasonable designs,
   conflicting constraints, or missing acceptance criteria. Routine implementation choices
   (naming, file layout) are NOT open decisions — just use your judgment.

3. **Ask in Slack, wait for the reply — via the persisted state in `state/`.** If there is at
   least one open decision:
   - Pick a stable kebab-case slug for the issue (e.g. `make-the-skill-list-nicer`).
   - Ask with `scripts/ask.sh <slug> "<question>"`: ONE concise message quoting the issue title,
     stating the question(s), and offering concrete options (A/B/C) so the human can answer in a
     word or two. The script posts to the channel, saves `{channel, ts, question, answer}` to
     `state/<slug>.json`, and — crucially — **refuses to re-ask** when state for the slug already
     exists, so a restarted or headless run never double-posts.
   - Wait with `scripts/wait-reply.sh <slug> [timeout-seconds]` (run it in the background): it
     resumes from the state file, polls the thread every ~15s, fails loudly on API errors
     (revoked token, bot removed, …), records the answer back into the state file, and prints
     `ANSWER: <text>`. If the answer was already recorded by an earlier run, it returns it
     immediately. Do NOT start implementing the ambiguous part before the answer.
   - **On any restart** (new session, fresh environment with the same checkout): check `state/`
     first — a pending `<slug>.json` with `"answer": null` means resume `wait-reply.sh`, not re-ask.
   - If a reply raises new questions, continue the conversation **in the same thread**
     (`chat.postMessage` with `"thread_ts":"<ts>"`), and keep waiting.
   - If no reply arrives within the timeout, post a note in the thread saying which default you're
     taking, then proceed with the most conservative interpretation.

4. **Implement on a branch.** Branch off `main`, make the change, update `spec/` to match
   (per AGENTS.md), and add/adjust integration tests for every spec case touched.

5. **Verify.** `npm test` must pass. If the change affects the web view, run `npm run e2e`
   (accept intended pixel changes with `npm run e2e -- --update-snapshots`).

6. **Open the PR.** Push the branch, `gh pr create` with a summary that links the issue text and the
   Slack thread decision ("Per Slack: <answer>"). Attach a short video demo when the change is
   interactive (per AGENTS.md).

7. **Close the loop in Slack.** Reply in the same thread with the PR link.

8. Run the `update-memory` skill after committing, per AGENTS.md.
