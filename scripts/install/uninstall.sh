#!/bin/bash
# Uninstall epicd plugin (thin directory-source topology).
#
# Deregisters the marketplace + plugin from settings.json. The framework cleans
# up its own cache/registry on the next /reload-plugins.
set -e

SCOPE="user"
while [ $# -gt 0 ]; do
  case "$1" in
    --scope)
      shift
      [ $# -gt 0 ] || { echo "uninstall.sh: --scope requires a value (user|project)" >&2; exit 1; }
      SCOPE="$1"
      ;;
    --scope=*)
      SCOPE="${1#--scope=}"
      ;;
    --user)
      SCOPE="user"
      ;;
    -h|--help)
      echo "Usage: bash scripts/install/uninstall.sh [--scope user|project] [--user]"
      exit 0
      ;;
    *)
      echo "uninstall.sh: unknown flag '$1'" >&2
      echo "Usage: bash scripts/install/uninstall.sh [--scope user|project] [--user]" >&2
      exit 1
      ;;
  esac
  shift
done
case "$SCOPE" in
  user|project) ;;
  *) echo "uninstall.sh: invalid --scope '$SCOPE' (expected: user|project)" >&2; exit 1 ;;
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

echo "Deregistering epicd plugin (scope: $SCOPE)..."
echo ""

if [ -f "$SETTINGS" ]; then
  jq --arg marketplace "$MARKETPLACE_NAME" \
     --arg key "$PLUGIN_KEY" \
     'del(.extraKnownMarketplaces[$marketplace]) | del(.enabledPlugins[$key])' \
     "$SETTINGS" > /tmp/epicd-settings-tmp.json \
  && mv /tmp/epicd-settings-tmp.json "$SETTINGS"
  echo "  Settings updated: $SETTINGS"
else
  echo "  No settings.json at $SETTINGS — nothing to deregister."
fi

echo ""
echo "epicd deregistered. Run /reload-plugins (or restart Claude Code) to finalize."
