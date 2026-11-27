# Real repository snapshots

These offline CLI fixtures use selected paths from `git ls-tree -r` and excerpts of the readable `SKILL.md` files at the commits below. The tree responses are reduced to the entries needed for these cases; the expected counts describe those projections, not every skill in the upstream repositories. The replay pins default-branch resolution to the listed commit. Excluded paths appear in the tree response but have no raw-file response: trying to read one fails the test.

| Upstream snapshot | What it covers |
| --- | --- |
| [JetBrains/android](https://github.com/JetBrains/android/tree/4d9ec3e52b338aa1c962c1ff0421cc62db5c73af) | `writing-lint-checks` under `agent/skills`; this historical revision still contains the file. |
| [JetBrains/MPS](https://github.com/JetBrains/MPS/tree/1cbf7f783dbc5c74c8e5231d31f61b02829143de) | The two project copies and the bundled plugin copy of `mps-aspect-generator` share the same Git blob. The replay includes a companion path for each project copy. |
| [JetBrains/koog](https://github.com/JetBrains/koog/tree/709079e4a34d6c9234583352550e6a2b88a0bb85) | `split-jvm-nonjvm` is a project workflow; `arithmetic-evaluator` and `weather-retrieval` are integration-test resources. |
# Skill map replay

`skill-map-answer.json` is a hand-authored representative Claude response for the local fixture's three stable skill IDs. It is the frozen answer used by the CLI/API tests and the browser test server; it is not a captured live model run. The test server injects it at the model boundary so the real parser and map rendering run without credentials or network calls to a model.
