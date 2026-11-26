---
id: 03-skill-details
title: Selecting a skill shows its full SKILL.md
preconditions: fixture/ scanned (steps 1–2 of 01-scan-local-repo)
---

1. Select the `commits` entry in the list.
   **Expect:** the full `SKILL.md` of `commits` appears: its front matter (the `---`-delimited
   block with `name` and `description`) visible above the instructions.
2. Look closely at how the contents are rendered.
   **Expect:** plain text. Markdown in the body (headings, lists, backticks) is shown as literal
   characters, not formatted; nothing is interpreted as HTML.
3. Select the `release-checklist` entry.
   **Expect:** its `SKILL.md` is shown as read — including the malformed front matter, verbatim.
