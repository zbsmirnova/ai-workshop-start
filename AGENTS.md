# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Memory
Read [./memory/MEMORY.md](memory/MEMORY.md) first. After each commit, run the `update-memory` skill: if the commit taught something durable the diff doesn't say (a gotcha, a decision and its why, a correction), save it to `memory/`; otherwise skip.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally

## Pull requests
- This project's automation target is `zbsmirnova/ai-workshop-start` (the fork), with base branch `main`. Do not target its parent `ndkoval/ai-workshop-start` unless the user explicitly requests it.
- At the start of each automation checkout, run `gh repo set-default zbsmirnova/ai-workshop-start`. This setting is local to the checkout; repeat it in fresh runs.
- Pass `--repo zbsmirnova/ai-workshop-start` to every `gh pr`, `gh issue`, and `gh run` command. Use explicit `repos/zbsmirnova/ai-workshop-start/...` paths for repository-scoped `gh api` calls. Do not rely on fork/upstream inference or bare PR numbers without a repository.
- Before pushing, verify the push remote points to the fork. Create PRs with `gh pr create --repo zbsmirnova/ai-workshop-start --base main --head <branch> --title <title> --body-file <file>` after pushing that branch to the fork.
- Read back the PR URL and base branch after creation. Before review or merge, verify that the PR URL belongs to `https://github.com/zbsmirnova/ai-workshop-start/pull/` and its base is `main`. A mismatched event/PR URL must be reported, not acted on. These routing rules do not themselves authorize a merge.
- Attach a short video demo when it makes sense — interactive behavior (live filtering, progressive loading, error flows), not static output

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run e2e`: the visual browser tests (`./scripts/e2e-browser.sh` once, first); a changed pixel fails — accept intended changes with `npm run e2e -- --update-snapshots`, or the e2e workflow's "update snapshots" dispatch on CI
