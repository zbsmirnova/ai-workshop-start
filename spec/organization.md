# Organization scan
## Input
A **GitHub organization or user URL** with exactly one path segment: `https://github.com/<owner>`, with or without the scheme or a trailing slash. A URL with two segments stays a [repository scan](analysis.md); a bare name stays a local directory.
## Output
Every repository of the owner, each scanned as a [repository scan](analysis.md), combined into one result.
## Architecture
Core: list repositories → scan each → combine. CLI and [web view](web.md): *thin clients*, same as for one repository.
## Details
- Repositories come from the **GitHub API** listing (works for organizations and users), *all pages*; **forks and archived** repositories are skipped
- Repositories are scanned with a small fixed **concurrency**; the combined result is ordered by **repository name**
- Each repository keeps its own pinned *scanned commit*; skill IDs and links are unchanged
- A repository whose scan fails → a *warning* naming the repository, skip it, continue
- An unreachable owner, or a rate limit while listing → a clear message, exit code 1
- `GITHUB_TOKEN` is strongly recommended: an organization scan makes one scan per repository

## Command line
`./skill-atlas scan https://github.com/<owner> [--filter <words>]`
```
JetBrains · 142 repositories · 23 skills

JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…

JetBrains/mps · 2 skills
…
```
- The first header counts scanned repositories (after skipping forks and archived) and all listed skills
- Then one [repository section](cli.md#output) per repository *with at least one listed skill*, in repository-name order; skill-less repositories are omitted
- [`--filter`](cli.md#filter) applies to every skill; both headers count the *matching* skills, and a repository left with no matches is omitted
- No repositories, or no skills anywhere → a successful scan with `· 0 skills`
- Warnings go to *stderr*, prefixed with the repository id

## Web view
- The repository field also accepts an owner URL; `?repo=` and `?filter=` work the same
- The header: `<owner> · R repositories · N skills`; with an active filter, `… · M of N skills`
- Repository sections and skill entries as in the CLI; selecting a skill shows its `SKILL.md`, as for one repository

### API
`GET /api/scan?repo=<owner URL>` → `200`, JSON:
```json
{
  "organization": { "name": "JetBrains", "url": "https://github.com/JetBrains" },
  "repositories": [
    { "repository": { "id": "…", "organization": "…", "name": "…", "url": "…", "commit": "…" },
      "skills": [ … ], "warnings": ["…"] }
  ],
  "warnings": ["…"]
}
```
- `repositories`: every scanned repository, by name, *including* those with zero skills; `skills` as in the [repository response](web.md#api)
- Top-level `warnings`: listing and per-repository failure warnings
- Errors: the same `400`/`500` rules as a [repository scan](web.md#api)

## Edge cases
- An owner with no repositories, or only forks and archived ones → a successful scan with `· 0 repositories · 0 skills`
- A repository that disappears between listing and scanning (`404`) → a warning, skip it
- The listing is not filtered by `--filter`; the filter only selects skills
