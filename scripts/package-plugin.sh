#!/usr/bin/env bash
# package-plugin.sh — package the epicd Claude Code plugin (BACK-605.9 M1) into a
# distributable archive, alongside the CLI binary produced by `bun run build`.
#
# The plugin is markdown + shell/node scripts only (no compilation), so "packaging"
# is just an archive of the two directories the marketplace/plugin manifests declare:
#   .claude-plugin/   — marketplace.json (repo-root marketplace listing)
#   plugin/            — plugin.json + skills/ + scripts/ (the plugin source itself)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO_ROOT}/dist/epicd-plugin.tar.gz"

mkdir -p "${REPO_ROOT}/dist"
# --force-local: without it, an archive path containing a drive letter (e.g.
# "D:\a\epicd\epicd\dist\...") is misparsed by tar as a remote "host:path"
# spec on Windows runners (both bsdtar and GNU tar support this flag; it is a
# no-op on Linux/macOS).
tar --force-local -czf "$OUT" -C "$REPO_ROOT" .claude-plugin plugin

echo "Packaged epicd plugin: $OUT"
