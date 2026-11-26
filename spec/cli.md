# Command line
`./skill-atlas scan <GitHub URL | directory> [--filter <words>]`
`./skill-atlas serve [--port <port>]`: the same scan in a local [web view](web.md).
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.

## Filter
`--filter <words>` keeps only matching skills:
- Each whitespace-separated word must appear in the skill's **name or description** (*AND*)
- Case-insensitive **substring** match: `grad` matches `Gradle`
- The header counts the *matching* skills; no matches → a successful scan with `· 0 skills`
- A blank `--filter` value keeps every skill
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
  also: https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- One entry per verified equivalent [project skill](analysis.md#what-counts-as-a-skill); verified alternate paths print as `also:` links
- IDs use the primary path; sorted by **name**, then primary path; the description's *first sentence*
- Warnings go to *stderr*
