---
id: 04-url-state
title: Repository and filter kept in the address
preconditions: none
---

1. Scan the `fixture/` directory (steps 1–2 of 01-scan-local-repo), then look at the address bar.
   **Expect:** the address contains `?repo=<the entered link>` (URL-encoded).
2. Type `messages` into the filter field and look at the address bar.
   **Expect:** the address now also carries `filter=messages`.
3. Copy the full address, open it in a new tab (or reload).
   **Expect:** the page scans `fixture/` by itself, then applies the filter: header
   `fixture · 1 of 3 skills`, only `commits` listed, both fields pre-filled.
4. Open `http://localhost:4173/?filter=style` directly — a filter without any scan.
   **Expect:** the filter field shows `style`, no error; after typing the `fixture/` path and
   pressing *Scan*, the filter applies at once: `fixture · 1 of 3 skills`, only `code-style`.
5. Clear the filter field and look at the address bar.
   **Expect:** every skill is shown again and the `filter` parameter is gone from the address.
