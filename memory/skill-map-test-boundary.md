---
name: skill-map-test-boundary
description: Why browser checks need an isolated server and recorded model answers
metadata:
  type: decision
  date: 2026-11-27
---

Manual QA and automated browser checks need to coexist in a cloud workspace. A running development server can otherwise take the test port or supply a different model configuration, making a browser result depend on which server started first.

**Why:** The skill-map review exposed this interaction; live Claude calls also require credentials and produce variable groups that cannot support pixel-exact comparisons.
**How to apply:** Keep the test-only server on port 4174 separate from manual QA on 4173, fail rather than reuse an existing test server, and use recorded model answers. Label demos that use recorded answers explicitly.
