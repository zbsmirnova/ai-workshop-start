#!/usr/bin/env bash
# Install the pinned browser stack for the e2e tests — the SAME bytes locally (cloud Linux) and on
# CI, so screenshot baselines compare pixel-for-pixel. Chromium comes from the public snapshot
# bucket (Playwright's own CDN is not reachable from every environment); ffmpeg (for the videos)
# and the fonts come from apt.
set -euo pipefail

# Pinned Chromium snapshot: 160.0.8186.0. Bump deliberately — it invalidates the baselines.
REV=1755637
DEST=${CHROMIUM_DIR:-/opt/browsers}
SUDO=$(command -v sudo || true)

if [ ! -x "$DEST/chrome-linux/chrome" ]; then
  $SUDO mkdir -p "$DEST"
  curl -fsSL -o /tmp/chrome-linux.zip \
    "https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/$REV/chrome-linux.zip"
  $SUDO unzip -q -o /tmp/chrome-linux.zip -d "$DEST"
  rm /tmp/chrome-linux.zip
fi

export DEBIAN_FRONTEND=noninteractive
$SUDO apt-get update -qq
$SUDO apt-get install -y -qq ffmpeg fontconfig fonts-liberation fonts-dejavu-core \
  libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 \
  libasound2t64 libatspi2.0-0t64 >/dev/null

# Playwright records video through its own ffmpeg build; point it at the system one.
FFREV=$(node -e "const b=require('./node_modules/playwright-core/browsers.json');console.log(b.browsers.find(x=>x.name==='ffmpeg').revision)")
mkdir -p "$HOME/.cache/ms-playwright/ffmpeg-$FFREV"
ln -sf "$(command -v ffmpeg)" "$HOME/.cache/ms-playwright/ffmpeg-$FFREV/ffmpeg-linux"

"$DEST/chrome-linux/chrome" --version
