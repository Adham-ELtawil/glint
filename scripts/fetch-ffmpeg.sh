#!/usr/bin/env bash
# Puts the FFmpeg build Glint bundles (ffmpeg.exe, ffprobe.exe) where Tauri's
# `bundle.externalBin` expects them: src-tauri/binaries/<name>-<target>.exe.
#
# The binaries, their source tarball and build script are published as the
# `ffmpeg-9.0.2-glint2` release of this repository (see
# src-tauri/licenses/FFmpeg-BUILD.txt). Every download is checked against the
# SHA-256 sums below, so a changed asset fails the build.
#
#   scripts/fetch-ffmpeg.sh             download the Windows build
#   scripts/fetch-ffmpeg.sh --stub-host also create empty placeholders for
#                                       this machine's target (Linux/macOS CI),
#                                       which only need the files to exist
set -euo pipefail

TAG="ffmpeg-9.0.2-glint2"
ZIP="glint-ffmpeg-9.0.2-glint2-win64.zip"
ZIP_SHA256="2cdfd176bef97ade813b5400ef2783557938191e99702261488d19cbdee27b11"
FFMPEG_SHA256="97ae5a1ea943d282b2a2bd8881f9da7f4cd0c6eda1e9cb1750e3daf82cf1c017"
FFPROBE_SHA256="0c00db541608af9a66d7d845990d3a3dec12a21f495fd117d6f413c37d2ea868"
URL="https://github.com/Adham-ELtawil/glint/releases/download/${TAG}/${ZIP}"
TRIPLE="x86_64-pc-windows-msvc"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$root/src-tauri/binaries"
mkdir -p "$dest"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

check() {
  local file="$1" want="$2" got
  got="$(sha256 "$file")"
  if [ "$got" != "$want" ]; then
    echo "SHA-256 mismatch for $file: expected $want, got $got" >&2
    return 1
  fi
}

ffmpeg_out="$dest/ffmpeg-$TRIPLE.exe"
ffprobe_out="$dest/ffprobe-$TRIPLE.exe"

if [ -f "$ffmpeg_out" ] && [ -f "$ffprobe_out" ] &&
  check "$ffmpeg_out" "$FFMPEG_SHA256" 2>/dev/null &&
  check "$ffprobe_out" "$FFPROBE_SHA256" 2>/dev/null; then
  echo "FFmpeg binaries already in place."
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "Downloading $URL"
  curl -fsSL --retry 3 --retry-delay 5 -o "$tmp/$ZIP" "$URL"
  check "$tmp/$ZIP" "$ZIP_SHA256"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q -o "$tmp/$ZIP" ffmpeg.exe ffprobe.exe -d "$tmp/x"
  else
    python3 -m zipfile -e "$tmp/$ZIP" "$tmp/x" 2>/dev/null || python -m zipfile -e "$tmp/$ZIP" "$tmp/x"
  fi
  check "$tmp/x/ffmpeg.exe" "$FFMPEG_SHA256"
  check "$tmp/x/ffprobe.exe" "$FFPROBE_SHA256"
  cp "$tmp/x/ffmpeg.exe" "$ffmpeg_out"
  cp "$tmp/x/ffprobe.exe" "$ffprobe_out"
  echo "FFmpeg binaries verified and placed in src-tauri/binaries."
fi

if [ "${1:-}" = "--stub-host" ]; then
  host="$(rustc -vV | sed -n 's/^host: //p')"
  if [ "$host" != "$TRIPLE" ]; then
    # Tauri only checks that these exist when building for this machine.
    for name in ffmpeg ffprobe; do
      [ -e "$dest/$name-$host" ] || : >"$dest/$name-$host"
    done
    echo "Created placeholders for $host."
  fi
fi
