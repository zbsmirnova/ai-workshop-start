# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Memory
Read [./memory/MEMORY.md](memory/MEMORY.md) first. After each commit, run the `update-memory` skill: if the commit taught something durable the diff doesn't say (a gotcha, a decision and its why, a correction), save it to `memory/`; otherwise skip.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally

## Delegated issues
Implement an issue (e.g. one labeled "Delegated to AI") with the `issue-to-pr` skill ([.claude/skills/issue-to-pr](.claude/skills/issue-to-pr/SKILL.md)): when the issue leaves a decision open, it asks in Slack first and waits for the thread reply — never guess on open decisions. Pending questions persist in the skill's `state/`; on restart, resume waiting instead of re-asking.

## Pull requests
- Attach a short video demo when it makes sense — interactive behavior (live filtering, progressive loading, error flows), not static output

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run e2e`: the visual browser tests (`./scripts/e2e-browser.sh` once, first); a changed pixel fails — accept intended changes with `npm run e2e -- --update-snapshots`, or the e2e workflow's "update snapshots" dispatch on CI
