#!/usr/bin/env bash
# install-platform.sh — bootstrap a target project for a non-Claude-Code
# AI tool (Cursor / GitHub Copilot / Codex CLI / Gemini CLI / VS Code).
#
# These tools don't have Claude Code's marketplace, so we install via
# our own renderer scripts. Each `bin/init.mjs` writes the right files
# to the target project.
#
# Usage:
#   ./scripts/install-platform.sh --platform=<NAME> --target=<DIR> [--ctx CTX] [--force] [--theme=THEME] [--lite] [--lang=en|ko|auto]
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
# --lite:
#   builder-only lightweight scaffold. For Codex, passes --lite through to
#   codex-init so it writes AGENTS.md + base skills only.
#
# --lang:
#   persist the interaction language into generated root guidance and
#   .agent-all.json where supported. Valid values: en, ko, auto.
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
LITE=0
HAS_LANG=0
INIT_LANG=""

for arg in "$@"; do
  case "$arg" in
    --platform=*) PLATFORM="${arg#*=}" ;;
    --target=*)   TARGET="${arg#*=}" ;;
    --ctx=*)      CTX_PATH="${arg#*=}"; HAS_CTX=1 ;;
    --force)      HAS_FORCE=1 ;;
    --theme=*)    THEME="${arg#*=}" ;;
    --lite)       LITE=1 ;;
    --lang=*)     INIT_LANG="${arg#*=}"; HAS_LANG=1 ;;
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

if [ "$HAS_LANG" = "1" ]; then
  case "$INIT_LANG" in
    en|ko|auto) ;;
    *)
      echo "Error: --lang must be one of: en, ko, auto." >&2
      exit 1
      ;;
  esac
fi

if [ "$LITE" = "1" ] && { [ "$THEME" = "floor" ] || [ "$THEME" = "thrift" ]; }; then
  echo "Error: --lite can only be used with --theme=all or --theme=builder." >&2
  exit 1
fi

TARGET_ABS="$(cd "$TARGET" 2>/dev/null && pwd)" || { echo "Error: target dir does not exist: $TARGET" >&2; exit 1; }

if [ "$LITE" = "1" ]; then
  echo "Installing for $PLATFORM into $TARGET_ABS (theme: builder, profile: lite)"
else
  echo "Installing for $PLATFORM into $TARGET_ABS (theme: $THEME, profile: operational)"
fi
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
  if [ "$HAS_LANG" = "1" ]; then
    AGENT_INIT_LANG="$INIT_LANG" "${cmd[@]}"
  else
    "${cmd[@]}"
  fi
  local status=$?
  set -e
  if [ $status -ne 0 ]; then
    echo "  ✖ $plugin / $script FAILED (exit $status)"
    return $status
  fi
}

run_builder_init() {
  if [ "$LITE" = "1" ] && [ "$EMIT_PLATFORM" = "codex" ]; then
    if [ "$HAS_LANG" = "1" ]; then
      run_init "harness-builder-$EMIT_PLATFORM" "init.mjs" --lite --lang="$INIT_LANG"
    else
      run_init "harness-builder-$EMIT_PLATFORM" "init.mjs" --lite
    fi
  else
    if [ "$HAS_LANG" = "1" ] && [ "$EMIT_PLATFORM" = "codex" ]; then
      run_init "harness-builder-$EMIT_PLATFORM" "init.mjs" --lang="$INIT_LANG"
    else
      run_init "harness-builder-$EMIT_PLATFORM" "init.mjs"
    fi
  fi
}

# Map theme → plugins to install
case "$THEME" in
  all)
    run_builder_init
    if [ "$LITE" != "1" ]; then
      run_init "harness-floor-$EMIT_PLATFORM" "init.mjs"
      if [ "$EMIT_PLATFORM" = "codex" ]; then
        run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs" --no-instrument
      else
        run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs"
      fi
    fi
    ;;
  builder)
    run_builder_init
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
if [ "$LITE" = "1" ]; then
  case "$EMIT_PLATFORM" in
    cursor)
      echo "  - .cursor/rules/, .cursor/agents/ (builder-only lite scaffold)"
      ;;
    copilot)
      echo "  - .github/copilot-instructions.md, .github/instructions/ (builder-only lite scaffold)"
      ;;
    codex)
      echo "  - AGENTS.md, .codex/skills/{planner,dev,reviewer}/ (builder-only lite scaffold)"
      echo "  - Note: lite mode skips floor/thrift files and global Codex config snippets"
      ;;
    gemini)
      echo "  - GEMINI.md, .gemini/skills/ (builder-only lite scaffold)"
      ;;
  esac
  exit 0
fi

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
