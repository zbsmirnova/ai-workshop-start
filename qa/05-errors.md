---
id: 05-errors
title: Failed scans show a clear error
preconditions: none
---

1. Open `http://localhost:4173`, type a non-existent local path (e.g. `/no/such/directory`) into
   the repository field and press *Scan*.
   **Expect:** a clear, human-readable error message shown *in place of* the results — not a blank
   page, not a raw stack trace, not a frozen "scanning" state.
2. Press *Scan* with the repository field empty.
   **Expect:** the page handles it gracefully: a clear message (or the button simply does
   nothing) — never a crash or an unlabeled failure.
3. After the error from step 1, scan the valid `fixture/` path.
   **Expect:** the error disappears and the normal result is shown: `fixture · 3 skills`. The page
   recovers fully from a failed scan.
