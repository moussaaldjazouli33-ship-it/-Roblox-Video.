#!/usr/bin/env bash
# Planche contact : bash scripts/sheet.sh nom t1 t2 ... (9 max) → out/sheet-nom.jpg
set -e
name=$1; shift
rm -rf out/snaps/$name; SNAP_DIR=out/snaps/$name node scripts/snap.mjs "$@" > /dev/null
n=$(ls out/snaps/$name/*.jpg | wc -l); cols=$(( n < 3 ? n : 3 )); rows=$(( (n + 2) / 3 ))
ffmpeg -v error -y -pattern_type glob -i "out/snaps/$name/*.jpg" -vf "scale=360:640,tile=${cols}x${rows}" -frames:v 1 out/sheet-$name.jpg
echo out/sheet-$name.jpg
