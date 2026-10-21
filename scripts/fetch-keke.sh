#!/usr/bin/env bash
# Download the pinned keke release binary: fetch-keke.sh <target-triple> <dest>
# Linux gnu targets use the static musl build, which runs on any glibc.
set -euo pipefail

triple="$1"
dest="$2"
version="$(tr -d '[:space:]' < "$(dirname "$0")/../.github/keke-version")"
[[ "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || { echo "Invalid keke version: $version" >&2; exit 1; }

asset_triple="${triple/-linux-gnu/-linux-musl}"
case "$asset_triple" in
  *windows*) pattern="keke-${asset_triple}.zip" ;;
  *) pattern="keke-${asset_triple}.tar.gz" ;;
esac

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gh release download "$version" -R milisp/keke-agent -p "$pattern" -D "$work"

mkdir "$work/out"
if [[ "$pattern" == *.zip ]]; then
  7z x -y -o"$work/out" "$work/$pattern" >/dev/null
else
  tar -xzf "$work/$pattern" -C "$work/out"
fi

bin="$(find "$work/out" -type f \( -name keke -o -name keke.exe \) | head -1)"
[[ -n "$bin" ]] || { echo "keke binary not found in $pattern" >&2; exit 1; }
mkdir -p "$(dirname "$dest")"
cp "$bin" "$dest"
chmod +x "$dest"
