# Skill Atlas

Project skills in a repository: `./skill-atlas scan` finds `SKILL.md` files under the approved
skill roots and prints their name, description and link. Exact normalized copies are combined only
when a complete path listing confirms there are no companion files or recognized local resources;
their alternate links are shown as well.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

An owner URL, `./skill-atlas scan https://github.com/JetBrains`, scans every repository of an
organization or user — forks and archived repositories skipped — and prints one section per
repository with skills. Set `GITHUB_TOKEN`: that is one scan per repository.

The same scan in a local web view: a field for the repository link, its skills, and each skill's
`SKILL.md`. It listens on this machine only and stores nothing.

```console
$ ./skill-atlas serve            # or --port <port>
Skill Atlas at http://localhost:4173
```

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
