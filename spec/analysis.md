# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
One entry per project skill: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:<selected path>`, display name, description, selected path, alternate paths, commit
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The display name: front matter, else the skill directory name
- The link pins the *scanned commit*
- Invalid front matter → a *warning*, use the directory name and no description, and continue
- Unreachable repository → a clear message, exit code 1

## What counts as a skill?
A project skill is defined by a readable `<root>/<name>/SKILL.md` at one of these four repository-relative roots:

- `.agents/skills`
- `.claude/skills`
- `.github/skills`
- `agent/skills`

`<name>` is exactly one directory component directly under the root. Matching is case-sensitive. Every readable matching file is a candidate skill. A folder name alone does not determine whether two candidates are the same skill.

The scanner merges candidates only when the complete `SKILL.md` contents are identical after converting CRLF/CR line endings to LF and trimming outer whitespace, and it can verify that neither candidate depends on other files. The path listing must be complete, the skill directory must contain no other files, and the instructions must contain no recognized local resource references (such as relative Markdown links or script/resource paths). Metadata is part of the compared contents, so any metadata or instruction difference keeps the candidates separate. If the listing is incomplete or a companion file or local resource reference is present, candidates remain separate even when their `SKILL.md` contents match. This is a conservative text-based equivalence check, not a proof of semantic equivalence.

For verified equivalents, select the primary path by this root order: `.agents/skills`, `.claude/skills`, `.github/skills`, then `agent/skills`; use path order to break ties. Retain the other matching paths as alternate links. A missing candidate (GitHub `404` or local read failure) produces a warning and is skipped; other GitHub read errors abort the scan. The ID is `<repository id>:<selected path>`; neither metadata nor the scanned commit determines it. When metadata has no display name, the selected path's directory name is used.

Any other path is not a project skill. For example:

| Path | Result |
| --- | --- |
| `.agents/skills/alpha/SKILL.md` and `.claude/skills/renamed/SKILL.md`, with identical contents and no dependencies | One entry, with both paths |
| `.agents/skills/review/SKILL.md` and `.claude/skills/review/SKILL.md`, with different instructions | Two skills, despite the same name |
| `agent/skills/writing-lint-checks/SKILL.md` | Included: `agent/skills` is an approved root |
| `plugins/mcp-tools/resources/…/skills/mps-aspect-generator/SKILL.md` | Excluded: bundled plugin resource outside the roots |
| `integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md` | Excluded: test fixture outside the roots |
| `SKILL.md`, `.agents/skills/SKILL.md`, `.agents/skills/group/shared/SKILL.md`, or `.agents/skills/shared/skill.md` | Excluded: none matches the exact path shape |

## Edge cases
- No matching files → a successful scan with zero skills
- Local scans skip directories named `.git` or `node_modules` at any depth. Symlinks inside the repository are skipped, but a symlink passed as the scan root is followed.
- Missing or unclosed front matter, malformed YAML, YAML conversion errors, or non-mapping YAML → a warning; use the directory name and an empty description, then continue
- Blank or unsupported `name` values → use the directory name; numeric `name` and `description` values are converted to strings; unsupported description values become empty without a warning
- A GitHub `404` or local read failure → warn and skip that copy; other GitHub read failures abort the scan
- If all discovered candidates are unreadable, return a successful zero-skill result and keep the read warnings
- Incomplete path listings, companion files, and recognized local resource references prevent automatic merging

### GitHub listing limitations

- A truncated recursive tree triggers a warning and a fallback to the four known skill directories. A truncated fallback subtree does not trigger another warning; results may be incomplete and candidates are not merged.
- With `GITHUB_TOKEN`, code search stops after 1,000 results without a warning and lists paths from the default branch. Since it does not list companion files, its candidates are not merged. File contents are read at the pinned commit; a listed path missing there is warned and skipped.
