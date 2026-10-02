#!/usr/bin/env bash
# Builds the synchrotron size-comparison video: Blender frames (resumable, so
# only missing frames render) -> H.264 footage -> Remotion labels, music and
# whooshes -> audio levelled and mastered to -14 LUFS (scripts/master-compare.py).
#
# Usage (from viral_xray_factory/): scripts/build-compare.sh [portrait|landscape]
# To re-render part of the flyover, delete those frames from
# renders/compare/synchrotron-sizes/<format>/frames/ first.

set -euo pipefail
FMT=${1:-portrait}
ID=synchrotron-sizes
BLENDER=${BLENDER:-$HOME/Applications/Blender.app/Contents/MacOS/Blender}
FRAMES=renders/compare/$ID/$FMT/frames
PREMASTER=renders/$ID-$FMT-premaster.mp4
FINAL=renders/$ID-$FMT.mp4

caffeinate -is "$BLENDER" -b -P scripts/blender/synchrotron_compare.py -- --format "$FMT" --render > "renders/compare/$ID/$FMT-blender.log" 2>&1
echo "frames: $(ls "$FRAMES" | wc -l | tr -d ' ')"
ffmpeg -loglevel error -y -framerate 30 -i "$FRAMES/f_%04d.png" -c:v libx264 -crf 15 -preset slow -pix_fmt yuv420p "public/footage/compare/$ID-$FMT.mp4"
npx remotion render src/index.ts "SynchrotronSizes-$FMT" "$PREMASTER" 2>&1 | tail -1

python3 scripts/master-compare.py "$PREMASTER" "$FINAL"
rm -f "$PREMASTER"
