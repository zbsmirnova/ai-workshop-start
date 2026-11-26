---
id: 06-ui-sanity
title: Visual sanity — layout, legibility, text-not-HTML
preconditions: fixture/ scanned (steps 1–2 of 01-scan-local-repo); window about 1280×800
---

1. Look at the whole page after the scan.
   **Expect:** header, filter, list, and warning are all visible and legible — readable contrast,
   nothing overlapping, nothing clipped or overflowing the window horizontally.
2. Select `commits` and inspect the shown `SKILL.md`.
   **Expect:** repository text is rendered **as text, never as HTML**: any `<tag>`, `&amp;`, or
   markdown in the file appears as literal characters. No styling, images, or scripts leak from
   repository content into the page.
3. Narrow the window to about 700px wide.
   **Expect:** the page remains usable: long links and descriptions wrap or truncate visibly
   instead of forcing a horizontal scroll of the whole page; the Scan button and filter stay
   reachable.
4. Restore the window and start a scan of `fixture/` again; watch the moment between pressing
   *Scan* and the result.
   **Expect:** the page shows some indication a scan is in progress (or completes visibly fast);
   it never looks broken or stuck mid-scan.
