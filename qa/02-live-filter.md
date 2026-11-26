---
id: 02-live-filter
title: Live, client-side filtering
preconditions: fixture/ scanned (steps 1–2 of 01-scan-local-repo)
---

1. Type `commit` into the filter field. Do not press Scan.
   **Expect:** the list narrows *as you type* — no page reload, no re-scan. `commits` stays, and so
   does `code-style` (its description says "committing": substring match). `release-checklist`
   disappears. The header reads `fixture · 2 of 3 skills`.
2. Change the filter to `style project` (two words).
   **Expect:** only `code-style` remains (both words must match its name or description — *AND*).
   Header: `fixture · 1 of 3 skills`.
3. Change the filter to `xyzzy`.
   **Expect:** an empty list — but still a successful state, header `fixture · 0 of 3 skills`,
   no error message.
4. Change the filter to `MESSAGES` (upper case).
   **Expect:** matching is case-insensitive: only `commits` ("…commit messages…") is shown,
   `fixture · 1 of 3 skills`.
5. Clear the filter field.
   **Expect:** all three skills return and the header reads `fixture · 3 skills` (no `of`).
