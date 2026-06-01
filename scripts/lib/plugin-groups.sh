#!/usr/bin/env bash
# Shared marketplace plugin groups for install/update scripts.

MARKETPLACE="${MARKETPLACE:-agent-skill}"

CLAUDE_CODE_NATIVE=(
  "harness-builder"
  "harness-floor"
  "harness-thrift"
  "harness-explore"
  "harness-debug"
)

CLI_PORTS_CODEX=("harness-builder-codex" "harness-floor-codex" "harness-thrift-codex" "harness-debug-codex")
CLI_PORTS_COPILOT=("harness-builder-copilot" "harness-floor-copilot" "harness-thrift-copilot")
CLI_PORTS_GEMINI=("harness-builder-gemini" "harness-floor-gemini" "harness-thrift-gemini")
CLI_PORTS_CURSOR=("harness-builder-cursor" "harness-floor-cursor" "harness-thrift-cursor")

ALL_PLUGINS=(
  "${CLAUDE_CODE_NATIVE[@]}"
  "${CLI_PORTS_CODEX[@]}"
  "${CLI_PORTS_COPILOT[@]}"
  "${CLI_PORTS_GEMINI[@]}"
  "${CLI_PORTS_CURSOR[@]}"
)

select_plugins_for_mode() {
  case "$1" in
    claude-code) PLUGINS=("${CLAUDE_CODE_NATIVE[@]}") ;;
    cli-codex)   PLUGINS=("${CLI_PORTS_CODEX[@]}") ;;
    cli-copilot) PLUGINS=("${CLI_PORTS_COPILOT[@]}") ;;
    cli-gemini)  PLUGINS=("${CLI_PORTS_GEMINI[@]}") ;;
    cli-cursor)  PLUGINS=("${CLI_PORTS_CURSOR[@]}") ;;
    all)         PLUGINS=("${ALL_PLUGINS[@]}") ;;
    *)
      echo "Internal error: unknown plugin mode '$1'." >&2
      return 1
      ;;
  esac
}

plugin_platform_label() {
  case "$1" in
    *-codex)   echo "Codex CLI" ;;
    *-copilot) echo "Copilot CLI" ;;
    *-gemini)  echo "Gemini CLI" ;;
    *-cursor)  echo "Cursor" ;;
    *)         echo "Claude Code" ;;
  esac
}

print_plugin_install_dry_run() {
  local p platform
  for p in "$@"; do
    platform="$(plugin_platform_label "$p")"
    if [ "$platform" = "Claude Code" ]; then
      echo "DRY-RUN: claude plugin install ${p}@${MARKETPLACE}"
    else
      echo "DRY-RUN: install ${p}@${MARKETPLACE} for ${platform} (marketplace command: claude plugin install ${p}@${MARKETPLACE})"
    fi
  done
}
