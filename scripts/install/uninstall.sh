#!/bin/bash
# Uninstall epicd plugin via the native Claude Code plugin CLI.
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

MARKETPLACE_NAME="epicd"
PLUGIN_KEY="epicd@${MARKETPLACE_NAME}"

echo "Uninstalling epicd plugin (scope: $SCOPE)..."
claude plugins uninstall "$PLUGIN_KEY" --scope "$SCOPE" -y 2>/dev/null || true

echo "Removing epicd marketplace (scope: $SCOPE)..."
claude plugins marketplace remove "$MARKETPLACE_NAME" --scope "$SCOPE" 2>/dev/null || true

echo ""
echo "epicd deregistered. Run /reload-plugins (or restart Claude Code) to finalize."
