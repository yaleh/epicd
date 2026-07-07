#!/bin/bash
# Install epicd plugin via the native Claude Code plugin CLI.
#
# Registers the repo root as a directory-source marketplace, then installs the
# plugin. The framework handles cache, versioning, and the plugin registry.
#
# Default scope is user; --scope project registers in the project's .claude/ instead.
set -e

SCOPE="user"
while [ $# -gt 0 ]; do
  case "$1" in
    --scope)
      shift
      [ $# -gt 0 ] || { echo "install.sh: --scope requires a value (user|project)" >&2; exit 1; }
      SCOPE="$1"
      ;;
    --scope=*)
      SCOPE="${1#--scope=}"
      ;;
    --user)
      SCOPE="user"
      ;;
    -h|--help)
      echo "Usage: bash scripts/install/install.sh [--scope user|project] [--user]"
      echo "  --scope user (default)  Register for the current user (~/.claude/settings.json)"
      echo "  --scope project         Register for the current project (./.claude/settings.json)"
      exit 0
      ;;
    *)
      echo "install.sh: unknown flag '$1'" >&2
      echo "Usage: bash scripts/install/install.sh [--scope user|project] [--user]" >&2
      exit 1
      ;;
  esac
  shift
done
case "$SCOPE" in
  user|project) ;;
  *) echo "install.sh: invalid --scope '$SCOPE' (expected: user|project)" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MARKETPLACE_NAME="epicd"
PLUGIN_KEY="epicd@${MARKETPLACE_NAME}"

if [ ! -f "$REPO_ROOT/.claude-plugin/marketplace.json" ]; then
  echo "install.sh: ERROR — $REPO_ROOT/.claude-plugin/marketplace.json not found." >&2
  echo "  Run this script from an epicd checkout." >&2
  exit 1
fi

echo "Registering epicd marketplace (scope: $SCOPE, source: $REPO_ROOT)..."
claude plugins marketplace add "$REPO_ROOT" --scope "$SCOPE"

echo "Installing epicd plugin (scope: $SCOPE)..."
claude plugins install "$PLUGIN_KEY" --scope "$SCOPE"

echo ""
echo "Verify with: claude plugins list"
echo "Restart Claude Code (or run /reload-plugins) to activate skills."
