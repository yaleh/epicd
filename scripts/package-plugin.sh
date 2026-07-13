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

# Sync both manifests' "version" field to the current package.json version.
# Without this, the manifests stay hardcoded at their initial value forever,
# so `claude plugin update`/`claude plugin marketplace update` short-circuit
# on version-string equality and silently no-op even when the underlying
# directory-source plugin content has changed.
VERSION="$(bun "${REPO_ROOT}/scripts/print-version.ts")"
for manifest in "${REPO_ROOT}/plugin/.claude-plugin/plugin.json" "${REPO_ROOT}/.claude-plugin/marketplace.json"; do
	sed -i.bak -E "s/\"version\": \"[^\"]*\"/\"version\": \"${VERSION}\"/" "$manifest"
	rm -f "${manifest}.bak"
done

mkdir -p "${REPO_ROOT}/dist"
# Give tar a relative -f path (by cd-ing into REPO_ROOT first) rather than an
# absolute one: an absolute path containing a drive letter (e.g.
# "D:\a\epicd\epicd\dist\...") is misparsed by tar as a remote "host:path"
# spec on Windows runners. --force-local also fixes this but isn't supported
# by every tar (e.g. macOS's stock tar rejects the unknown flag outright), so
# avoiding the drive-letter argument entirely is the portable fix.
(cd "$REPO_ROOT" && tar -czf "dist/epicd-plugin.tar.gz" .claude-plugin plugin)

echo "Packaged epicd plugin: $OUT"
