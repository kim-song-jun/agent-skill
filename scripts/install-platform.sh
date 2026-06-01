#!/usr/bin/env bash
# install-platform.sh — bootstrap a target project for a non-Claude-Code
# AI tool (Cursor / GitHub Copilot / Codex CLI / Gemini CLI / VS Code).
#
# These tools don't have Claude Code's marketplace, so we install via
# our own renderer scripts. Each `bin/init.mjs` writes the right files
# to the target project.
#
# Usage:
#   ./scripts/install-platform.sh --platform=<NAME> --target=<DIR> [--ctx CTX] [--force] [--theme=THEME]
#
# --platform:
#   cursor          — Cursor IDE (.cursor/rules + .cursor/agents)
#   copilot         — GitHub Copilot CLI (.github/copilot-instructions.md + hooks)
#   vscode-copilot  — VS Code Copilot extension (.github/copilot-instructions.md only)
#   codex           — OpenAI Codex CLI (AGENTS.md + .codex/skills/)
#   gemini          — Google Gemini CLI / antigravity (GEMINI.md + .gemini/skills/)
#
# --theme:
#   all             — builder + floor + thrift (default)
#   builder         — just /agent-init (CLAUDE.md/AGENTS.md/GEMINI.md + agents)
#   floor           — just /agent-all + /visual-qa (config files)
#   thrift          — just /thrift (long-session cost optimization)
#
# Examples:
#   ./scripts/install-platform.sh --platform=cursor --target=/path/to/my-app
#   ./scripts/install-platform.sh --platform=codex --target=. --theme=floor
#   ./scripts/install-platform.sh --platform=copilot --target=. --ctx=ctx.json --force

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLATFORM=""
TARGET=""
CTX_PATH=""
HAS_CTX=0
HAS_FORCE=0
THEME="all"

for arg in "$@"; do
  case "$arg" in
    --platform=*) PLATFORM="${arg#*=}" ;;
    --target=*)   TARGET="${arg#*=}" ;;
    --ctx=*)      CTX_PATH="${arg#*=}"; HAS_CTX=1 ;;
    --force)      HAS_FORCE=1 ;;
    --theme=*)    THEME="${arg#*=}" ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

if [ -z "$PLATFORM" ] || [ -z "$TARGET" ]; then
  echo "Error: --platform and --target are required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

# Normalize vscode-copilot → copilot (same emitter; VS Code reads .github/copilot-instructions.md)
EMIT_PLATFORM="$PLATFORM"
case "$PLATFORM" in
  vscode-copilot) EMIT_PLATFORM="copilot" ;;
  cursor|copilot|codex|gemini) ;;
  *)
    echo "Error: unknown platform '$PLATFORM'." >&2
    echo "Valid: cursor, copilot, vscode-copilot, codex, gemini" >&2
    exit 1
    ;;
esac

case "$THEME" in
  all|builder|floor|thrift) ;;
  *)
    echo "Error: unknown theme '$THEME'." >&2
    echo "Valid: all, builder, floor, thrift" >&2
    exit 1
    ;;
esac

TARGET_ABS="$(cd "$TARGET" 2>/dev/null && pwd)" || { echo "Error: target dir does not exist: $TARGET" >&2; exit 1; }

echo "Installing for $PLATFORM into $TARGET_ABS (theme: $THEME)"
echo

run_init() {
  local plugin="$1"
  local script="$2"
  shift 2
  local path="$REPO_ROOT/plugins/$plugin/bin/$script"
  if [ ! -f "$path" ]; then
    echo "  ⊙ skip $plugin (no $script available yet)"
    return 0
  fi
  echo "  → $plugin / $script"
  set +e
  cmd=(node "$path" "$TARGET_ABS")
  if [ "$HAS_CTX" = "1" ]; then
    cmd+=(--ctx "$CTX_PATH")
  fi
  if [ "$HAS_FORCE" = "1" ]; then
    cmd+=(--force)
  fi
  cmd+=("$@")
  "${cmd[@]}"
  local status=$?
  set -e
  if [ $status -ne 0 ]; then
    echo "  ✖ $plugin / $script FAILED (exit $status)"
    return $status
  fi
}

# Map theme → plugins to install
case "$THEME" in
  all)
    run_init "harness-builder-$EMIT_PLATFORM" "init.mjs"
    run_init "harness-floor-$EMIT_PLATFORM" "init.mjs"
    if [ "$EMIT_PLATFORM" = "codex" ]; then
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs" --no-instrument
    else
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs"
    fi
    ;;
  builder)
    run_init "harness-builder-$EMIT_PLATFORM" "init.mjs"
    ;;
  floor)
    run_init "harness-floor-$EMIT_PLATFORM" "init.mjs"
    ;;
  thrift)
    if [ "$EMIT_PLATFORM" = "codex" ]; then
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs" --no-instrument
    else
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs"
    fi
    ;;
esac

echo
echo "Done. Inspect the target project for the new files:"
case "$EMIT_PLATFORM" in
  cursor)
    echo "  - .cursor/rules/, .cursor/agents/, .visual-qa.json, .agent-all.json, .thrift.json"
    ;;
  copilot)
    echo "  - .github/copilot-instructions.md, .github/hooks/, .visual-qa.json, .agent-all.json, .thrift.json"
    ;;
  codex)
    echo "  - AGENTS.md, .codex/skills/, .visual-qa.json, .agent-all.json, .thrift.json"
    echo "  - Note: codex-config.toml snippet was printed to stdout — merge into ~/.codex/config.toml"
    ;;
  gemini)
    echo "  - GEMINI.md, .gemini/skills/, .visual-qa.json, .agent-all.json, .thrift.json"
    echo "  - Note: gemini-settings.json snippet was printed to stdout — merge into ~/.gemini/settings.json"
    ;;
esac

if [ "$PLATFORM" = "vscode-copilot" ]; then
  echo
  echo "VS Code Copilot reads .github/copilot-instructions.md natively."
  echo "Hooks under .github/hooks/ are for the gh copilot CLI; ignored by the editor."
fi
