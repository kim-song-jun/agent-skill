#!/usr/bin/env bash
# install-all.sh — bulk install every plugin in this marketplace via the
# `claude` CLI. Bypasses Claude Code's one-at-a-time `/plugin install`.
#
# Usage:
#   ./scripts/install-all.sh                  # install Claude Code essentials (5 plugins)
#   ./scripts/install-all.sh --all            # install all 17 plugins (incl. CLI-platform siblings)
#   ./scripts/install-all.sh --claude-code    # explicit: just the 5 native ones (default)
#   ./scripts/install-all.sh --cli=codex      # builder + floor + thrift, all for Codex CLI
#   ./scripts/install-all.sh --cli=copilot    # ... for Copilot CLI
#   ./scripts/install-all.sh --cli=gemini     # ... for Gemini CLI
#   ./scripts/install-all.sh --cli=cursor     # ... for Cursor
#   ./scripts/install-all.sh --dry-run        # print commands; don't execute
#
# Requires: `claude` binary in PATH. Marketplace must already be added:
#   /plugin marketplace add https://github.com/kim-song-jun/agent-skill

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKETPLACE="agent-skill"
MODE="claude-code"
DRY_RUN=0
. "$SCRIPT_DIR/lib/plugin-groups.sh"

for arg in "$@"; do
  case "$arg" in
    --all)         MODE="all" ;;
    --claude-code) MODE="claude-code" ;;
    --cli=codex)   MODE="cli-codex" ;;
    --cli=copilot) MODE="cli-copilot" ;;
    --cli=gemini)  MODE="cli-gemini" ;;
    --cli=cursor)  MODE="cli-cursor" ;;
    --dry-run)     DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

select_plugins_for_mode "$MODE"

echo "Installing ${#PLUGINS[@]} plugins from ${MARKETPLACE}:"
for p in "${PLUGINS[@]}"; do
  echo "  - ${p}"
done
echo

if [ "$DRY_RUN" = "1" ]; then
  print_plugin_install_dry_run "${PLUGINS[@]}"
  echo
  echo "Dry run complete. Re-run without --dry-run to actually install."
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: 'claude' binary not found in PATH." >&2
  echo "Install Claude Code first, or copy/paste the slash commands below into Claude Code:" >&2
  for p in "${PLUGINS[@]}"; do
    echo "  /plugin install ${p}@${MARKETPLACE}"
  done
  echo "  /reload-plugins"
  exit 1
fi

failed=()
installed=()
skipped=()

for p in "${PLUGINS[@]}"; do
  set +e
  output=$(claude plugin install "${p}@${MARKETPLACE}" 2>&1)
  status=$?
  set -e
  if [ $status -ne 0 ]; then
    if echo "$output" | grep -qi "already installed"; then
      echo "  ⊙ ${p} (already installed)"
      skipped+=("$p")
    else
      echo "  ✖ ${p} — FAILED"
      echo "$output" | sed 's/^/    /'
      failed+=("$p")
    fi
  else
    echo "  ✓ ${p}"
    installed+=("$p")
  fi
done

echo
echo "Summary:"
echo "  Installed: ${#installed[@]}"
echo "  Already installed: ${#skipped[@]}"
echo "  Failed: ${#failed[@]}"

if [ ${#failed[@]} -gt 0 ]; then
  echo
  echo "Failed plugins:"
  for p in "${failed[@]}"; do
    echo "  - ${p}"
  done
  exit 1
fi

echo
echo "Next: restart Claude Code (or run /reload-plugins) to apply."
