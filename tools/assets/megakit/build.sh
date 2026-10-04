#!/usr/bin/env bash
# Rebuilds public/assets/kits/megakit/*.glb from the unzipped Quaternius "Stylized Nature MegaKit" (Standard).
# Usage: tools/assets/megakit/build.sh <path to the pack's glTF/ folder>
# Needs node + pnpm (registry access). Work happens in a temp dir; far.mjs gets meshoptimizer + @gltf-transform/core installed there.
set -euo pipefail
SRC=$(cd "$1" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$HERE/../../.." && pwd)/public/assets/kits/megakit
W=$(mktemp -d)
mkdir -p "$OUT"
cp "$HERE/prep.py" "$HERE/far.mjs" "$W/"
cd "$W"
echo '{"type":"module"}' > package.json
pnpm add @gltf-transform/core meshoptimizer
G="pnpm dlx @gltf-transform/cli@latest"
python3 prep.py "$SRC"   # per-category .list files + patched copies in src/ (bark forced OPAQUE)
for c in trees plants grass rocks; do
  $G merge $(cat $c.list) raw-$c.glb --merge-scenes
  $G dedup raw-$c.glb raw-$c.glb
done
COMMON="--compress meshopt --texture-compress webp --flatten false --join false --instance false --palette false --simplify false"
$G optimize raw-trees.glb  "$OUT/trees.glb"  $COMMON --texture-size 1024
$G optimize raw-plants.glb "$OUT/plants.glb" $COMMON --texture-size 1024
$G optimize raw-grass.glb  "$OUT/grass.glb"  $COMMON --texture-size 512
$G optimize raw-rocks.glb  "$OUT/rocks.glb"  $COMMON --texture-size 512
# far trees: gltf-transform simplify cannot reach 25 % (loose leaf cards), so far.mjs thins the leaf cards and simplifies bark
$G weld raw-trees.glb far-w.glb
node far.mjs far-w.glb far-x.glb 0.25 0.25
$G optimize far-x.glb "$OUT/trees-far.glb" $COMMON --texture-size 512
ls -l "$OUT"
