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
- The first header counts the listed repositories — forks and archived skipped — and the skills found
- The CLI prints every repository at once; only the [web API](#api) is paged
- Then one [repository section](cli.md#output) per repository *with at least one listed skill*, in repository-name order; skill-less repositories are omitted
- [`--filter`](cli.md#filter) applies to every skill; both headers count the *matching* skills, and a repository left with no matches is omitted
- No repositories, or no skills anywhere → a successful scan with `· 0 skills`
- Warnings go to *stderr*, prefixed with the repository id

## Web view
- The repository field also accepts an owner URL; `?repo=` and `?filter=` work the same
- Submitting an owner URL fetches the **listing alone first** ([`page=0`](#api)): an `R repositories` **badge** appears by the field *at once*, before any repository is scanned
- A **progress bar** under the field fills as pages arrive (`page / pageCount`), and the result is loaded **page by page**; the header still ends with `· scanning…` while more pages load
- The header: `<owner> · R repositories · N skills`; with an active filter, `… · M of N skills`
- The result is a **digest**, not full sections: a line `W with skills, among them` (just `W with skills` once every row shows), then one **row** per repository with a listed skill — its **name** and `n skills` — in repository-name order
- The digest shows the first **three** rows, then `+K more`; selecting `+K more` expands every row
- **Selecting a row** expands that repository's skill entries under it (name, description, links, as in a repository scan); selecting a skill shows its `SKILL.md`, as for one repository
- The filter applies to every skill: rows and both counts use the *matching* skills, and a repository left with none disappears
- Warnings under the digest, prefixed with the repository id; a single-repository scan is unchanged

```
[ github.com/JetBrains        142 repositories ]
▓▓▓▓▓▓▓▓░░░░░░░░░░░░
27 with skills, among them
intellij-community                     38 skills
MPS                                    41 skills
kotlin                                  6 skills
+24 more
```

### API
`GET /api/scan?repo=<owner URL>[&page=<n>]` → `200`, JSON: one page of **20 repositories**, by name; `page` is 1-based, 1 by default. `page=0` answers the **listing alone**, at once and without scanning: `repositoryCount` and `pageCount` as usual, `repositories` empty.
```json
{
  "organization": { "name": "JetBrains", "url": "https://github.com/JetBrains" },
  "repositoryCount": 142, "page": 1, "pageCount": 8,
  "repositories": [
    { "repository": { "id": "…", "organization": "…", "name": "…", "url": "…", "commit": "…" },
      "skills": [ … ], "warnings": ["…"] }
  ],
  "warnings": ["…"]
}
```
- *Nothing is stored*: each page request lists the repositories again and scans only its slice; a repository created or renamed between requests may shift pages
- `repositories`: the page's repositories, by name, *including* those with zero skills; `skills` as in the [repository response](web.md#api). A repository whose scan failed is missing, with a top-level warning.
- Top-level `warnings`: listing warnings and this page's failure warnings
- A `page` past `pageCount` → `200` with empty `repositories`; a `page` that is not a non-negative integer → `400`
- Errors: the same `400`/`500` rules as a [repository scan](web.md#api)

## Edge cases
- An owner with no repositories, or only forks and archived ones → a successful scan with `· 0 repositories · 0 skills`
- A repository that disappears between listing and scanning (`404`) → a warning, skip it
- The listing is not filtered by `--filter`; the filter only selects skills
