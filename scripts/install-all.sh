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
#   ./scripts/install-all.sh --foundations    # also install approved foundations
#   ./scripts/install-all.sh --foundations-only
#                                               # install only superpowers/context-mode
#   ./scripts/install-all.sh --dry-run        # print commands; don't execute
#
# Requires: `claude` binary in PATH. Marketplace must already be added:
#   /plugin marketplace add https://github.com/kim-song-jun/agent-skill

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MARKETPLACE="agent-skill"
MODE="claude-code"
DRY_RUN=0
UPDATE_FOUNDATIONS=0
FOUNDATIONS_ONLY=0
FOUNDATION_PLUGINS=(
  "superpowers@claude-plugins-official"
  "context-mode@context-mode"
)
FOUNDATION_MARKETPLACES=(
  "claude-plugins-official"
  "context-mode"
)
. "$SCRIPT_DIR/lib/plugin-groups.sh"

usage() {
  cat <<'EOF'
install-all.sh — bulk install every plugin in this marketplace via the
`claude` CLI. Bypasses Claude Code's one-at-a-time `/plugin install`.

Usage:
  ./scripts/install-all.sh                  # install Claude Code essentials (5 plugins)
  ./scripts/install-all.sh --all            # install all 17 plugins (incl. CLI-platform siblings)
  ./scripts/install-all.sh --claude-code    # explicit: just the 5 native ones (default)
  ./scripts/install-all.sh --cli=codex      # builder + floor + thrift, all for Codex CLI
  ./scripts/install-all.sh --cli=copilot    # ... for Copilot CLI
  ./scripts/install-all.sh --cli=gemini     # ... for Gemini CLI
  ./scripts/install-all.sh --cli=cursor     # ... for Cursor
  ./scripts/install-all.sh --foundations    # also install approved foundations
  ./scripts/install-all.sh --foundations-only
                                             # install only superpowers/context-mode
  ./scripts/install-all.sh --dry-run        # print commands; don't execute

Approved foundations:
  superpowers@claude-plugins-official
  context-mode@context-mode

Requires: `claude` binary in PATH. Marketplace must already be added:
  /plugin marketplace add https://github.com/kim-song-jun/agent-skill
EOF
}

print_foundation_install_dry_run() {
  local marketplace key
  echo "Selected foundation install dry-run:"
  for marketplace in "${FOUNDATION_MARKETPLACES[@]}"; do
    echo "DRY-RUN: claude plugin marketplace update ${marketplace}"
  done
  for key in "${FOUNDATION_PLUGINS[@]}"; do
    echo "DRY-RUN: claude plugin install ${key}"
  done
}

run_foundation_installs() {
  local marketplace key name output status
  local failed=()
  local installed=()
  local skipped=()

  echo "Installing approved foundation plugins:"
  for marketplace in "${FOUNDATION_MARKETPLACES[@]}"; do
    claude plugin marketplace update "$marketplace" 2>&1 | tail -1 || true
  done
  echo

  for key in "${FOUNDATION_PLUGINS[@]}"; do
    name="${key%@*}"
    set +e
    output=$(claude plugin install "$key" 2>&1)
    status=$?
    set -e
    if [ $status -ne 0 ]; then
      if echo "$output" | grep -qi "already installed"; then
        echo "  ⊙ ${name} (already installed)"
        skipped+=("$name")
      else
        echo "  ✖ ${name} — FAILED"
        echo "$output" | sed 's/^/    /'
        failed+=("$name")
      fi
    else
      echo "  ✓ ${name}"
      installed+=("$name")
    fi
  done

  echo
  echo "Foundation summary:"
  echo "  Installed: ${#installed[@]}"
  echo "  Already installed: ${#skipped[@]}"
  echo "  Failed: ${#failed[@]}"

  if [ ${#failed[@]} -gt 0 ]; then
    echo
    echo "Failed foundation plugins:"
    for name in "${failed[@]}"; do
      echo "  - ${name}"
    done
    return 1
  fi
}

for arg in "$@"; do
  case "$arg" in
    --all)         MODE="all" ;;
    --claude-code) MODE="claude-code" ;;
    --cli=codex)   MODE="cli-codex" ;;
    --cli=copilot) MODE="cli-copilot" ;;
    --cli=gemini)  MODE="cli-gemini" ;;
    --cli=cursor)  MODE="cli-cursor" ;;
    --foundations) UPDATE_FOUNDATIONS=1 ;;
    --foundations-only)
      UPDATE_FOUNDATIONS=1
      FOUNDATIONS_ONLY=1
      ;;
    --dry-run)     DRY_RUN=1 ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

if [ "$FOUNDATIONS_ONLY" = "0" ]; then
  select_plugins_for_mode "$MODE"

  echo "Installing ${#PLUGINS[@]} plugins from ${MARKETPLACE}:"
  for p in "${PLUGINS[@]}"; do
    echo "  - ${p}"
  done
  if [ "$UPDATE_FOUNDATIONS" = "1" ]; then
    echo
    echo "Also installing approved foundation plugins:"
    for p in "${FOUNDATION_PLUGINS[@]}"; do
      echo "  - ${p}"
    done
  fi
  echo
else
  echo "Installing approved foundation plugins only:"
  for p in "${FOUNDATION_PLUGINS[@]}"; do
    echo "  - ${p}"
  done
  echo
fi

if [ "$DRY_RUN" = "1" ]; then
  if [ "$UPDATE_FOUNDATIONS" = "1" ]; then
    print_foundation_install_dry_run
    echo
  fi
  if [ "$FOUNDATIONS_ONLY" = "0" ]; then
    print_plugin_install_dry_run "${PLUGINS[@]}"
    echo
  fi
  echo
  echo "Dry run complete. Re-run without --dry-run to actually install."
  exit 0
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "Error: 'claude' binary not found in PATH." >&2
  echo "Install Claude Code first, or copy/paste the slash commands below into Claude Code:" >&2
  if [ "$UPDATE_FOUNDATIONS" = "1" ]; then
    echo "  /plugin marketplace update claude-plugins-official"
    echo "  /plugin marketplace update context-mode"
    for p in "${FOUNDATION_PLUGINS[@]}"; do
      echo "  /plugin install ${p}"
    done
  fi
  if [ "$FOUNDATIONS_ONLY" = "0" ]; then
    for p in "${PLUGINS[@]}"; do
      echo "  /plugin install ${p}@${MARKETPLACE}"
    done
  fi
  echo "  /reload-plugins"
  exit 1
fi

if [ "$UPDATE_FOUNDATIONS" = "1" ]; then
  run_foundation_installs
  if [ "$FOUNDATIONS_ONLY" = "0" ]; then
    echo
  fi
fi

if [ "$FOUNDATIONS_ONLY" = "1" ]; then
  echo "Next: restart Claude Code (or run /reload-plugins) to apply."
  exit 0
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
