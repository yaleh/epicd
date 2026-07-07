#!/bin/bash
# Install epicd plugin via thin directory-source marketplace registration.
#
# Registers the repo root as a directory-source marketplace and enables the plugin
# in settings.json. The framework handles cache, versioning, and plugin registry —
# this script performs the same registration as the native /plugin marketplace add flow.
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
PLUGIN_NAME="epicd"
PLUGIN_KEY="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

case "$SCOPE" in
  user)    CLAUDE_DIR="$HOME/.claude" ;;
  project) CLAUDE_DIR="$REPO_ROOT/.claude" ;;
esac
SETTINGS="$CLAUDE_DIR/settings.json"

if [ ! -f "$REPO_ROOT/.claude-plugin/marketplace.json" ]; then
  echo "install.sh: ERROR — $REPO_ROOT/.claude-plugin/marketplace.json not found." >&2
  echo "  Run this script from an epicd checkout." >&2
  exit 1
fi

PLUGIN_VERSION="$(python3 -c "import json; d=json.load(open('$REPO_ROOT/plugin/.claude-plugin/plugin.json')); print(d['version'])" 2>/dev/null || echo "unknown")"

echo "Registering epicd plugin (v${PLUGIN_VERSION}) as a directory-source marketplace..."
echo "  Scope:    $SCOPE"
echo "  Source:   $REPO_ROOT"
echo "  Settings: $SETTINGS"
echo ""

mkdir -p "$CLAUDE_DIR"
if [ ! -f "$SETTINGS" ]; then
  echo '{}' > "$SETTINGS"
fi

jq --arg marketplace "$MARKETPLACE_NAME" \
   --arg dir "$REPO_ROOT" \
   --arg key "$PLUGIN_KEY" \
   '. + {
     extraKnownMarketplaces: ((.extraKnownMarketplaces // {}) + {($marketplace): {"source": {"source": "directory", "path": $dir}}}),
     enabledPlugins: ((.enabledPlugins // {}) + {($key): true})
   }' "$SETTINGS" > /tmp/epicd-settings-tmp.json \
&& mv /tmp/epicd-settings-tmp.json "$SETTINGS"

echo "epicd registered successfully."
echo "  Restart Claude Code (or run /reload-plugins) to activate."
