# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.
## Definition of done
- All tests pass locally

## Pull requests
- Attach a short video demo when it makes sense — interactive behavior (live filtering, progressive loading, error flows), not static output

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run e2e`: the visual browser tests (`./scripts/e2e-browser.sh` once, first); a changed pixel fails — accept intended changes with `npm run e2e -- --update-snapshots`, or the e2e workflow's "update snapshots" dispatch on CI
