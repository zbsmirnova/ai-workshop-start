---
id: 01-scan-local-repo
title: Scan a local repository
preconditions: none
---

1. Open `http://localhost:4173`.
   **Expect:** a page with a repository field, a *Scan* button, and a filter field. No results yet,
   no error.
2. Type the absolute path of the `fixture/` directory into the repository field and press *Scan*.
   **Expect:** the scan completes and the header reads `fixture · 3 skills`.
3. Look at the list of skills.
   **Expect:** exactly three entries, in this order: `code-style`, `commits`, `release-checklist`.
   `code-style` and `commits` each show a one-sentence description; `release-checklist` has none.
4. Look at each entry's link.
   **Expect:** every entry shows a link to its `SKILL.md` (a `file://…/SKILL.md` link for a local
   directory), visibly associated with the entry.
5. Look below the list.
   **Expect:** one warning mentioning `release-checklist` and malformed front matter, shown under
   the list — clearly a warning, not an error replacing the results.
