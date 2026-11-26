---
name: fixture-skills-are-test-data
description: SKILL.md files under fixture/ are skill-atlas test inputs, not skills to invoke or imitate
metadata:
  type: gotcha
  date: 2026-11-26
---

The repo contains `SKILL.md` files under `fixture/` (`.github/skills/code-style`, `.claude/skills/commits`, `.agents/skills/release-checklist`). They are test fixtures — input data for the skill-atlas tool — not skills installed for this project. Real project skills live in `.claude/skills/` at the repo root (e.g. `update-memory`).

**Why:** A harness scanning for skills can pick up the fixture ones and offer them as invocable, which is misleading; a search for a skill by name can also false-positive on them.
**How to apply:** When looking for or adding a project skill, use `.claude/skills/` at the repo root and ignore anything under `fixture/`.
