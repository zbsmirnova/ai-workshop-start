---
name: update-memory
description: Record a durable learning from the current task into the repo's memory/ directory. Use after each commit, and whenever you learn something lasting — a gotcha, a correction from the user, a decision and its reason, a non-obvious fact about the codebase or tooling.
---

# Update memory

Save one note per fact into `memory/` at the repo root, then update the index.

## What to save

- Gotchas: things that cost time and would cost it again (tool quirks, env surprises, misleading names).
- Decisions: what was chosen, and *why* — the alternatives rejected matter more than the choice.
- Corrections: guidance the user gave on how to work in this repo.
- Non-obvious facts about the codebase that aren't readable from the code itself.

## What NOT to save

- Anything derivable from the code, specs, or git history (that's what they're for).
- Session-local details (file you just edited, test you just ran).
- Duplicates — check `memory/MEMORY.md` first; if a note on the topic exists, **update that file** instead of creating a new one. Delete notes that turned out to be wrong.

## Format

One file per fact: `memory/<short-kebab-case-slug>.md`

```markdown
---
name: <short-kebab-case-slug>
description: <one-line summary used to decide relevance when scanning>
metadata:
  type: decision | gotcha | feedback | reference
  date: <YYYY-MM-DD>
---

<the fact, 2–6 sentences>

**Why:** <what makes this true / what it cost to learn>
**How to apply:** <what to do differently next time>
```

Use absolute dates, never "today" or "last week". Link related notes with `[[their-slug]]`.

## Index

After writing or changing a note, update `memory/MEMORY.md` — one line per note:

```markdown
- [Short title](slug.md) — one-line hook
```

Keep the index sorted newest-first. Never put note bodies in the index.

## After each commit

When invoked post-commit, ask: "did this commit teach anything the diff doesn't say?" If yes, save it and include the `memory/` change in a follow-up or amend. If no, do nothing — an empty update is worse than none.
