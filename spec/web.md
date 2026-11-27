# Web view
`./skill-atlas serve [--port <port>]` starts a local web view at `http://localhost:4173` (or the given port) and keeps running until stopped.
It shows the same [scan](analysis.md) as the [command line](cli.md); *nothing is stored*.
`GITHUB_TOKEN`, optional, is read by the server and never sent to the page.

## Page
- A field for a **repository link**: a GitHub URL or a local directory, and a *Scan* button; an owner URL runs an [organization scan](organization.md)
- A **filter field**: filters the shown skills *live*, client-side, with the [CLI filter rules](cli.md#filter); no re-scan
- With an active filter: the field shows an `M of N` **count badge**, and each matching entry collapses to its **name** and a short **description snippet** around the first match, with every matched word *highlighted*; clearing the filter restores the full entries
- The header: `<owner>/<repo> · N skills`; with an active filter, `<owner>/<repo> · M of N skills`
- One entry per skill, in the scan order: **name**, **description**, the **link** pinned to the scanned commit, and its `also:` links
- When the source can tell, the entry also shows when the skill was last updated, as `updated <YYYY-MM-DD>` (UTC); a local directory scan uses the `SKILL.md` file's modification date, a GitHub scan omits it
- Selecting a skill shows its full **SKILL.md**: the front matter, if any, above the instructions, as plain text
- Warnings under the list; errors as a clear message in place of the result
- The field's value is kept in the address as `?repo=<link>`; opening such an address scans it
- The filter's value is kept in the address as `?filter=<words>`, even before any scan; opening such an address, or scanning with it typed, applies it once the scan shows its skills. A blank filter keeps every skill and drops the parameter.
- Repository text is shown as text, never as HTML

## API
`GET /api/scan?repo=<GitHub URL | directory>` → `200`, JSON:
```json
{
  "repository": { "id": "JetBrains/example", "organization": "JetBrains", "name": "example", "url": "https://github.com/JetBrains/example", "commit": "<commit>" },
  "skills": [{ "id": "…", "name": "…", "description": "…", "path": "…", "link": "…", "alternateLinks": ["…"], "contents": "<SKILL.md>" }],
  "warnings": ["…"]
}
```
- `contents`: the primary path's `SKILL.md` as read; verified equivalents have the same contents
- `updated`: `YYYY-MM-DD`, when the skill was last updated; only present when the source can tell (a local directory's file modification date)
- A missing or blank `repo`, or a scan that fails with a clear message (unreachable repository, rate limit, …) → `400`, `{ "error": "<message>" }`
- Any other failure → `500`, `{ "error": "Unexpected error: <message>" }`

## Local only
- The server listens on `127.0.0.1` only
- A request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` (any port) → `403`
- `GET /` → the page; any other path or method → `404`
- A port that is in use → a clear message, exit code 1

## Skill map
`GET /map` opens the interactive [skill map](map.md); `POST /api/map` groups its skills.
