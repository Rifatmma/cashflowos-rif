#!/usr/bin/env bash
# One-time (per machine/container) setup. Safe to re-run; it only does what's missing.
# Copies the engine out of the skill folder (which may be read-only) into a writable home,
# installs fonts + Playwright via npm, and the Python audio deps via pip.
# Prints the ENGINE path on the last line.
set -euo pipefail
SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOME_DIR="${MW_VIDEO_HOME:-$HOME/.mw-location-video}"
ENGINE="$HOME_DIR/engine"
PY="$(command -v python3 || command -v python)"

mkdir -p "$ENGINE"
if [ ! -f "$ENGINE/VERSION" ] || ! cmp -s "$SKILL_DIR/engine/VERSION" "$ENGINE/VERSION" || [ "${MW_FORCE_COPY:-0}" = 1 ]; then
  cp -R "$SKILL_DIR/engine/." "$ENGINE/"
  echo "engine copied → $ENGINE"
fi

command -v ffmpeg >/dev/null || { echo "MISSING ffmpeg — install it (Linux: apt-get install -y ffmpeg · macOS: brew install ffmpeg · Windows: winget install Gyan.FFmpeg) and re-run."; exit 1; }
command -v node >/dev/null || { echo "MISSING node (v18+) — install Node.js and re-run."; exit 1; }

if [ ! -d "$ENGINE/node_modules/@fontsource/poppins" ] || [ ! -d "$ENGINE/node_modules/playwright" ]; then
  (cd "$ENGINE" && npm install --silent --no-audit --no-fund)
fi
# a browser for Playwright: use a pre-installed one if present (cloud containers), else download chromium once
if ! ls /opt/pw-browsers/chromium-*/chrome-linux/chrome >/dev/null 2>&1 && [ -z "${CHROMIUM_PATH:-}" ]; then
  (cd "$ENGINE" && npx --yes playwright install chromium >/dev/null)
fi

"$PY" - <<'P' 2>/dev/null || "$PY" -m pip install -q numpy scipy edge-tts 2>&1 | grep -v WARNING || true
import numpy, scipy, edge_tts
P
"$PY" -c "import numpy, scipy, edge_tts" || { echo "MISSING python packages (numpy scipy edge-tts)"; exit 1; }
echo "ENGINE=$ENGINE"
