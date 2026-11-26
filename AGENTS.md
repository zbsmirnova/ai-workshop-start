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
- Attach a short video demo when it makes sense — interactive behavior (live filtering, progressive loading, error flows), not static output

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
