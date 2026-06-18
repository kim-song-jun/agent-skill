#!/usr/bin/env bash
# Update the agent-skill Codex CLI native plugin bundle in user scope.
#
# This script intentionally uses Codex's native plugin manager. The older
# scripts/update.sh --cli=codex path updates Codex-named bundles through
# Claude's plugin manager for Claude-hosted distribution tests.

set -euo pipefail

MARKETPLACE="agent-skill"
SOURCE="https://github.com/kim-song-jun/agent-skill"
DRY_RUN=0
VERIFY=1
PLUGINS=(
  "harness-builder-codex@agent-skill"
  "harness-floor-codex@agent-skill"
  "harness-thrift-codex@agent-skill"
  "harness-debug-codex@agent-skill"
)

usage() {
  cat <<'EOF'
Usage: bash scripts/update-codex-plugins.sh [options]

Updates the OpenAI Codex CLI native plugin bundle:
  codex plugin marketplace upgrade agent-skill
  codex plugin remove <plugin>@agent-skill
  codex plugin add <plugin>@agent-skill
  codex plugin list

Options:
  --dry-run       Print the Codex plugin update plan; change nothing.
  --no-verify    Skip the final 'codex plugin list' enabled-state check.
  -h, --help     Show this help and exit.
EOF
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --no-verify)
      VERIFY=0
      ;;
    *)
      echo "Error: unknown argument: $arg" >&2
      usage >&2
      exit 2
      ;;
  esac
done

print_plan() {
  local plugin
  echo "Codex native plugin update plan:"
  echo "DRY-RUN: codex plugin marketplace upgrade ${MARKETPLACE}"
  echo "DRY-RUN: codex plugin marketplace add ${SOURCE}  # only if upgrade cannot find the marketplace"
  for plugin in "${PLUGINS[@]}"; do
    echo "DRY-RUN: codex plugin remove ${plugin}"
    echo "DRY-RUN: codex plugin add ${plugin}"
  done
  if [ "$VERIFY" = "1" ]; then
    echo "DRY-RUN: codex plugin list"
  else
    echo "DRY-RUN: skip final enabled-state verification"
  fi
}

if [ "$DRY_RUN" = "1" ]; then
  print_plan
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  echo "Error: 'codex' binary not found in PATH." >&2
  echo "Install or upgrade OpenAI Codex CLI, then re-run this script." >&2
  exit 1
fi

echo "→ refreshing Codex native marketplace '${MARKETPLACE}' …"
if codex plugin marketplace upgrade "$MARKETPLACE" >/dev/null 2>&1; then
  echo "  ✓ marketplace upgraded"
else
  echo "  marketplace '${MARKETPLACE}' is not registered; registering agent-skill marketplace …"
  codex plugin marketplace add "$SOURCE"
  codex plugin marketplace upgrade "$MARKETPLACE"
  echo "  ✓ marketplace registered and upgraded"
fi

echo "→ force-updating Codex native agent-skill plugins …"
for plugin in "${PLUGINS[@]}"; do
  if codex plugin remove "$plugin" >/dev/null 2>&1; then
    echo "  - removed previous ${plugin}"
  else
    echo "  - ${plugin} was not previously installed"
  fi
  codex plugin add "$plugin"
  echo "  ✓ installed ${plugin}"
done

if [ "$VERIFY" = "1" ]; then
  echo "→ verifying Codex native plugin enabled state …"
  list_output="$(codex plugin list)"
  for plugin in "${PLUGINS[@]}"; do
    if printf '%s\n' "$list_output" | grep -F "$plugin" | grep -F "installed, enabled" >/dev/null; then
      echo "  ✓ ${plugin}"
    else
      echo "Error: ${plugin} was not reported as installed, enabled by 'codex plugin list'." >&2
      exit 1
    fi
  done
fi

echo "Codex native plugin update complete."
