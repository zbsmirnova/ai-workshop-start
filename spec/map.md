# The skill map

`./skill-atlas map <GitHub URL | directory> [--model claude]` scans a repository or owner and prints topic groups, skill names and original links. Warnings are preserved. An empty scan succeeds with zero groups.

Without AI, tokenize names and descriptions into case-insensitive Unicode words, ignoring short words and common stop words. Repeatedly group the remaining skills under their most frequent shared word (alphabetical tie break). Skills without shared words get their own group. Ordering is deterministic; each skill appears exactly once.

With `--model claude`, run `claude -p --model haiku` with the prompt on stdin, tools disabled, and only names, descriptions and IDs supplied as data. The local Claude CLI must be installed and authenticated. Nothing is stored. A 60-second timeout, process failure, invalid JSON, empty groups, missing IDs, duplicate IDs or invented IDs fails with a clear message; there is no silent fallback. Empty scans never call the model.

`./skill-atlas serve`, then `/map`, shows the map as topic cards. Enter a repository or owner, choose shared words or Claude Haiku, and build. Owner results include all pages. Selecting a skill shows its original SKILL.md and link. A pending request disables the build button; failures show a message and allow retry. All skill and model text renders as text. The existing repository view remains at `/`.

`POST /api/map` accepts JSON `{skills: [{id, name, description}], method: "heuristic" | "claude"}` and returns `{clusters: [{label, skillIds}]}`. Default method is heuristic. Input IDs must be unique; at most 2,000 skills and 1 MB input. Invalid input or model answers return 400, oversized input 413. The local Host restriction applies, JSON is required, and a foreign Origin returns 403.

Tests replay a saved model answer through an injected model runner, including browser tests through a test-only server. No test invokes Claude or requires model credentials. Visual browser tests cover both grouping methods and selection.
