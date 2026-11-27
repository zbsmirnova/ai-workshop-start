#!/usr/bin/env bash
# Assembles the demo video from the recorded scenes in demo/out/:
#   demo/record-web.mjs → web_scan.webm, web_org.webm (+ .marks.json), web_map.webm
#   vhs demo/*.tape     → cli_scan.mp4, cli_dev.mp4
# Optional: demo/out/slack.png — a screenshot of the agent asking in Slack (user-provided).
# Produces demo/out/skill-atlas-demo.mp4 (1280x800, 30 fps, silent).
set -euo pipefail
cd "$(dirname "$0")/out"

FONT=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf
FONT_R=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
BG=0x1b1f27
V="-c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -r 30 -an"

# card <out> <duration> <title> <subtitle>
card() {
  ffmpeg -loglevel error -y -f lavfi -i "color=c=$BG:s=1280x800:d=$2:r=30" -vf "
    drawtext=fontfile=$FONT:text='$3':fontcolor=white:fontsize=52:x=(w-text_w)/2:y=(h/2)-70,
    drawtext=fontfile=$FONT_R:text='$4':fontcolor=0x9aa7bd:fontsize=28:x=(w-text_w)/2:y=(h/2)+20,
    drawtext=fontfile=$FONT_R:text='Skill Atlas':fontcolor=0x2f6feb:fontsize=20:x=(w-text_w)/2:y=h-60" \
    $V "$1"
}

norm() { ffmpeg -loglevel error -y -i "$1" -vf "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2:color=$BG" $V "$2"; }

echo "— title cards"
card c0.mp4 3   "Skill Atlas"                      "project skills in a repository — scan · filter · map"
card c1.mp4 2.4 "1 · The command line"             "scan a repository · --filter · the skill map"
card c2.mp4 2.4 "2 · The web view"                 "live filter with highlights · SKILL.md · state in the URL"
card c3.mp4 2.4 "3 · A whole organization"         "progress page by page · a digest · drill down"
card c4.mp4 2.4 "4 · The skill map"                "shared words — or Claude Haiku groups by purpose"
card c5.mp4 2.4 "5 · How it is built"              "specs · memory · PRs · CI with pixel-exact e2e · QA skills"
card c7.mp4 3.2 "Made locally, with Claude Code"   "Playwright + VHS + ffmpeg — demo/ in the repo re-records it"

echo "— terminal and web scenes"
norm cli_scan.mp4 s_cli_scan.mp4
norm cli_dev.mp4  s_cli_dev.mp4
norm web_scan.webm s_web_scan.mp4

# Organization scan: timelapse the wait between the marks, label it honestly.
WS=$(python3 -c "import json;m={x['label']:x['t'] for x in json.load(open('web_org.marks.json'))};print(m['wait-start']+1.5)")
WE=$(python3 -c "import json;m={x['label']:x['t'] for x in json.load(open('web_org.marks.json'))};print(m['wait-end']-1.0)")
ffmpeg -loglevel error -y -i web_org.webm -filter_complex "
  [0:v]split=3[a][b][c];
  [a]trim=0:$WS,setpts=PTS-STARTPTS[a1];
  [b]trim=$WS:$WE,setpts=(PTS-STARTPTS)/6,drawtext=fontfile=$FONT_R:text='scan sped up 6x':fontcolor=white:fontsize=24:box=1:boxcolor=0x1b1f27aa:boxborderw=10:x=w-text_w-28:y=h-58[b1];
  [c]trim=$WE,setpts=PTS-STARTPTS[c1];
  [a1][b1][c1]concat=n=3[v]" -map "[v]" $V s_web_org.mp4

# Skill map: the Claude answer is pre-recorded (no Claude CLI in the recording sandbox) — say so.
CT=$(python3 -c "import json;m={x['label']:x['t'] for x in json.load(open('web_map.marks.json'))};print(m['claude']-1.0)")
ffmpeg -loglevel error -y -i web_map.webm -vf "drawtext=fontfile=$FONT_R:text='Claude answer pre-recorded — the recording sandbox has no Claude CLI':fontcolor=white:fontsize=20:box=1:boxcolor=0x1b1f27aa:boxborderw=10:x=28:y=h-54:enable='gte(t,$CT)'" $V s_web_map.mp4

# The Slack slot: the real screenshot when present, a card otherwise.
if [ -f slack.png ]; then
  ffmpeg -loglevel error -y -loop 1 -t 7 -i slack.png -f lavfi -i "color=c=$BG:s=1280x800:d=7:r=30" -filter_complex "
    [0:v]scale=1240:720:force_original_aspect_ratio=decrease[img];
    [1:v][img]overlay=(W-w)/2:70,
    drawtext=fontfile=$FONT_R:text='An open decision in an issue? The agent asks in Slack first — and waits.':fontcolor=white:fontsize=24:x=(w-text_w)/2:y=h-50[v]" \
    -map "[v]" $V s_slack.mp4
else
  card s_slack.mp4 4 "The agent asks in Slack" "an open decision in an issue is never guessed — it waits for the thread reply"
fi

echo "— concat"
printf "file '%s'\n" c0.mp4 c1.mp4 s_cli_scan.mp4 c2.mp4 s_web_scan.mp4 c3.mp4 s_web_org.mp4 c4.mp4 s_web_map.mp4 c5.mp4 s_cli_dev.mp4 s_slack.mp4 c7.mp4 > concat.txt
# Re-encode: stream-copy concat of separately encoded segments scrambles timestamps.
ffmpeg -loglevel error -y -f concat -safe 0 -i concat.txt $V skill-atlas-demo.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 skill-atlas-demo.mp4 | xargs printf "demo/out/skill-atlas-demo.mp4 — %ss\n"
