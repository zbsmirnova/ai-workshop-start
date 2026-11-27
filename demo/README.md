# The demo video kit

Re-records the whole demo after the product changes. Every scene is a script; nothing is
recorded by hand.

```console
$ export GITHUB_TOKEN=$(gh auth token)
$ node demo/server.ts &            # the real server, Claude answer pre-recorded (port 4175)
$ node demo/record-web.mjs         # browser scenes → demo/out/*.webm + beat marks
$ vhs demo/cli_scan.tape && vhs demo/cli_dev.tape   # terminal scenes
$ demo/assemble.sh                 # title cards, timelapse, captions → demo/out/skill-atlas-demo.mp4
$ demo/assemble-short.sh           # the ~20 s captioned cut → demo/out/skill-atlas-demo-20s.mp4
```

- `server.ts` — the production server composition with one swap: the Claude runner is replaced
  by `map-answer.json` (a real Claude grouping, recorded ahead of time), because the recording
  sandbox has no authenticated Claude CLI. The video says so on screen.
- `record-web.mjs` — Playwright scenes. Page video shows neither the URL bar nor the pointer,
  so both are drawn inside the page as a visible overlay. Writes `*.marks.json` beat
  timestamps; `assemble.sh` uses them to timelapse the organization-scan wait (labeled 6×).
- Scans are live GitHub scans of `anthropics` (the JetBrains org rejects our token — SAML).
- Needs: Chromium from `scripts/e2e-browser.sh`, `vhs` + `ttyd`, `ffmpeg`, `gh` authenticated.
- Drop a Slack-thread screenshot at `demo/out/slack.png` before `assemble.sh` to fill the
  "agent asks in Slack" slot; without it a text card is used.
