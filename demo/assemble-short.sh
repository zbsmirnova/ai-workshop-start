#!/usr/bin/env bash
# The ~20-second cut: four captioned beats from the scenes demo/record-web.mjs recorded.
# Needs demo/out/web_scan.webm, web_org.webm, web_map.webm (beat times assume those takes'
# marks — re-check demo/out/*.marks.json after re-recording).
# Produces demo/out/skill-atlas-demo-20s.mp4 (1280x800, 30 fps, silent).
set -euo pipefail
cd "$(dirname "$0")/out"

FONT=/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf
FONT_R=/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf
BOX="box=1:boxcolor=0x1b1f27cc:boxborderw=14"

cap() { echo "drawtext=fontfile=$FONT:text='$1':fontcolor=white:fontsize=32:$BOX:x=(w-text_w)/2:y=h-88"; }

ffmpeg -loglevel error -y -i web_scan.webm -i web_org.webm -i web_map.webm -filter_complex "
  [0:v]trim=4.8:8.8,setpts=PTS-STARTPTS,$(cap 'Skill Atlas — every agent skill in a repository')[b1];
  [0:v]trim=11.4:15.9,setpts=PTS-STARTPTS,$(cap 'Filter live · read any SKILL.md')[b2];
  [1:v]trim=3.7:7.2,setpts=PTS-STARTPTS[b3a];
  [1:v]trim=40.9:42.4,setpts=PTS-STARTPTS[b3b];
  [b3a][b3b]concat=n=2,$(cap 'Scan a whole organization')[b3];
  [2:v]trim=11.0:17.0,setpts=PTS-STARTPTS,$(cap 'Claude groups them by purpose'),
    drawtext=fontfile=$FONT_R:text='Claude answer pre-recorded':fontcolor=white:fontsize=18:$BOX:x=w-text_w-24:y=24,
    drawtext=fontfile=$FONT_R:text='made locally with Claude Code — demo/ in the repo re-records it':fontcolor=0xc3cbda:fontsize=20:$BOX:x=(w-text_w)/2:y=h-40[b4];
  [b1][b2][b3][b4]concat=n=4,fps=30[v]" -map "[v]" \
  -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -an skill-atlas-demo-20s.mp4

ffprobe -v error -show_entries format=duration -of csv=p=0 skill-atlas-demo-20s.mp4 |
  xargs printf "demo/out/skill-atlas-demo-20s.mp4 — %ss\n"
