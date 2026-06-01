#!/usr/bin/env bash
# install-platform.sh — bootstrap a target project for a non-Claude-Code
# AI tool (Cursor / GitHub Copilot / Codex CLI / Gemini CLI / VS Code).
#
# These tools don't have Claude Code's marketplace, so we install via
# our own renderer scripts. Each `bin/init.mjs` writes the right files
# to the target project.
#
# Usage:
#   ./scripts/install-platform.sh --platform=<NAME> --target=<DIR> [--ctx <PATH>] [--force] [--theme=THEME] [--lite] [--lang=en|ko|auto] [--dry-run] [--update-foundations] [--no-doctor] [--uninstall] [--force-root-clean]
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
# --dry-run:
#   print the selected renderer commands without writing files.
#
# --update-foundations:
#   for Codex installs, also update/install approved foundation plugins
#   (superpowers + context-mode) through scripts/update.sh --foundations-only.
#
# --no-doctor:
#   skip the automatic Codex post-install doctor check.
#
# --uninstall:
#   remove Codex project-local harness artifacts through the conservative
#   harness cleaner. Root AGENTS.md is preserved unless --force-root-clean is
#   also passed.
#
# --force-root-clean:
#   with --uninstall, also remove generated-looking root AGENTS.md.
#
# Examples:
#   ./scripts/install-platform.sh --platform=cursor --target=/path/to/my-app
#   ./scripts/install-platform.sh --platform=codex --target=. --theme=floor
#   ./scripts/install-platform.sh --platform=copilot --target=. --ctx=ctx.json --force

set -euo pipefail

print_usage() {
  cat <<'USAGE'
install-platform.sh — bootstrap a target project for a non-Claude-Code
AI tool (Cursor / GitHub Copilot / Codex CLI / Gemini CLI / VS Code).

These tools don't have Claude Code's marketplace, so we install via
our own renderer scripts. Each `bin/init.mjs` writes the right files
to the target project.

Usage:
  ./scripts/install-platform.sh --platform=<NAME> --target=<DIR> [--ctx <PATH>] [--force] [--theme=THEME] [--lite] [--lang=en|ko|auto] [--dry-run] [--update-foundations] [--no-doctor] [--uninstall] [--force-root-clean]

--platform:
  cursor          — Cursor IDE (.cursor/rules + .cursor/agents)
  copilot         — GitHub Copilot CLI (.github/copilot-instructions.md + hooks)
  vscode-copilot  — VS Code Copilot extension (.github/copilot-instructions.md only)
  codex           — OpenAI Codex CLI (AGENTS.md + .codex/skills/)
  gemini          — Google Gemini CLI / antigravity (GEMINI.md + .gemini/skills/)

--theme:
  all             — builder + floor + thrift (default)
  builder         — just /agent-init (CLAUDE.md/AGENTS.md/GEMINI.md + agents)
  floor           — just /agent-all + /visual-qa (config files)
  thrift          — just /thrift (long-session cost optimization)

--lite:
  builder-only lightweight scaffold. For Codex, passes --lite through to
  codex-init so it writes AGENTS.md + base skills only.

--lang:
  persist the interaction language into generated root guidance and
  .agent-all.json where supported. Valid values: en, ko, auto.

--dry-run:
  print the selected renderer commands without writing files.

--update-foundations:
  for Codex installs, also update/install approved foundation plugins
  (superpowers + context-mode) through scripts/update.sh --foundations-only.

--no-doctor:
  skip the automatic Codex post-install doctor check.

--uninstall:
  remove Codex project-local harness artifacts through the conservative
  harness cleaner. Root AGENTS.md is preserved unless --force-root-clean is
  also passed.

--force-root-clean:
  with --uninstall, also remove generated-looking root AGENTS.md.

Examples:
  ./scripts/install-platform.sh --platform=cursor --target=/path/to/my-app
  ./scripts/install-platform.sh --platform=codex --target=. --theme=floor --dry-run
  ./scripts/install-platform.sh --platform=codex --target=. --update-foundations
  ./scripts/install-platform.sh --platform=codex --target=. --uninstall --dry-run
  ./scripts/install-platform.sh --platform=copilot --target=. --ctx=ctx.json --force
USAGE
}

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
DRY_RUN=0
UPDATE_FOUNDATIONS=0
NO_DOCTOR=0
UNINSTALL=0
FORCE_ROOT_CLEAN=0

while [ "$#" -gt 0 ]; do
  arg="$1"
  case "$arg" in
    --platform=*) PLATFORM="${arg#*=}" ;;
    --target=*)   TARGET="${arg#*=}" ;;
    --ctx=*)      CTX_PATH="${arg#*=}"; HAS_CTX=1 ;;
    --ctx)
      shift
      case "${1:-}" in
        ""|--*)
          echo "Error: --ctx requires a path." >&2
          echo "Run with --help for usage." >&2
          exit 1
          ;;
      esac
      CTX_PATH="$1"
      HAS_CTX=1
      ;;
    --force)      HAS_FORCE=1 ;;
    --theme=*)    THEME="${arg#*=}" ;;
    --lite)       LITE=1 ;;
    --lang=*)     INIT_LANG="${arg#*=}"; HAS_LANG=1 ;;
    --dry-run)    DRY_RUN=1 ;;
    --update-foundations) UPDATE_FOUNDATIONS=1 ;;
    --no-doctor)  NO_DOCTOR=1 ;;
    --uninstall)  UNINSTALL=1 ;;
    --force-root-clean) FORCE_ROOT_CLEAN=1 ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
  shift
done

if [ -z "$PLATFORM" ] || [ -z "$TARGET" ]; then
  echo "Error: --platform and --target are required." >&2
  echo "Run with --help for usage." >&2
  exit 1
fi

# Normalize vscode-copilot → copilot (same emitter; VS Code reads .github/copilot-instructions.md)
EMIT_PLATFORM="$PLATFORM"
VS_CODE_COPILOT=0
case "$PLATFORM" in
  vscode-copilot) EMIT_PLATFORM="copilot"; VS_CODE_COPILOT=1 ;;
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

detect_language_from_env() {
  case "${AGENT_INIT_LANG:-}" in
    en|ko)
      printf "%s\n" "$AGENT_INIT_LANG"
      return 0
      ;;
  esac
  local locale="${LANG:-} ${LC_ALL:-} ${LC_MESSAGES:-}"
  case "$locale" in
    *ko*|*KO*|*Korean*|*korean*)
      printf "ko\n"
      ;;
    *)
      printf "en\n"
      ;;
  esac
}

if [ "$HAS_LANG" = "1" ] && [ "$INIT_LANG" = "auto" ]; then
  INIT_LANG="$(detect_language_from_env)"
fi

if [ "$LITE" = "1" ] && { [ "$THEME" = "floor" ] || [ "$THEME" = "thrift" ]; }; then
  echo "Error: --lite can only be used with --theme=all or --theme=builder." >&2
  exit 1
fi

if [ "$UPDATE_FOUNDATIONS" = "1" ] && [ "$PLATFORM" != "codex" ]; then
  echo "Error: --update-foundations is currently supported only with --platform=codex." >&2
  echo "Use scripts/update.sh --foundations-only to refresh the approved Claude Code foundations directly." >&2
  exit 1
fi

if [ "$UNINSTALL" = "1" ] && [ "$PLATFORM" != "codex" ]; then
  echo "Error: --uninstall is currently supported only with --platform=codex." >&2
  echo "Use plugin-specific uninstall commands for Cursor/Copilot/Gemini artifacts." >&2
  exit 1
fi

if [ "$FORCE_ROOT_CLEAN" = "1" ] && [ "$UNINSTALL" != "1" ]; then
  echo "Error: --force-root-clean can only be used with --uninstall." >&2
  exit 1
fi

if [ "$VS_CODE_COPILOT" = "1" ] && { [ "$THEME" = "floor" ] || [ "$THEME" = "thrift" ]; }; then
  echo "Error: vscode-copilot supports only the builder instructions surface." >&2
  exit 1
fi

format_cmd() {
  local rendered=""
  local part
  for part in "$@"; do
    if [ -z "$rendered" ]; then
      printf -v rendered "%q" "$part"
    else
      printf -v rendered "%s %q" "$rendered" "$part"
    fi
  done
  printf "%s\n" "$rendered"
}

TARGET_ABS="$(cd "$TARGET" 2>/dev/null && pwd)" || { echo "Error: target dir does not exist: $TARGET" >&2; exit 1; }

if [ "$UNINSTALL" = "1" ]; then
  echo "Uninstalling for $PLATFORM from $TARGET_ABS$([ "$DRY_RUN" = "1" ] && printf " (dry-run"))"
  echo
  clean_cmd=(node "$REPO_ROOT/scripts/harness-clean.mjs" "--target=$TARGET_ABS" "--platform=codex")
  if [ "$DRY_RUN" = "1" ]; then
    clean_cmd+=(--dry-run)
  fi
  if [ "$FORCE_ROOT_CLEAN" = "1" ]; then
    clean_cmd+=(--force-root)
  fi
  echo "  → harness cleaner"
  if [ "$DRY_RUN" = "1" ]; then
    echo "  DRY-RUN: $(format_cmd "${clean_cmd[@]}")"
  fi
  "${clean_cmd[@]}"
  echo
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY-RUN complete. No files were removed."
  else
    echo "Done. Review any skipped root guidance files reported above."
  fi
  exit 0
fi

if [ "$LITE" = "1" ]; then
  echo "Installing for $PLATFORM into $TARGET_ABS (theme: builder, profile: lite$([ "$DRY_RUN" = "1" ] && printf ", dry-run"))"
else
  echo "Installing for $PLATFORM into $TARGET_ABS (theme: $THEME, profile: operational$([ "$DRY_RUN" = "1" ] && printf ", dry-run"))"
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
  local cmd=(node "$path" "$TARGET_ABS")
  if [ "$HAS_CTX" = "1" ]; then
    cmd+=(--ctx "$CTX_PATH")
  fi
  if [ "$HAS_FORCE" = "1" ]; then
    cmd+=(--force)
  fi
  cmd+=("$@")
  if [ "$DRY_RUN" = "1" ]; then
    echo "  DRY-RUN: $(format_cmd "${cmd[@]}")"
    return 0
  fi
  set +e
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

run_foundation_update() {
  echo
  echo "  → approved foundation update"
  if [ "$DRY_RUN" = "1" ]; then
    echo "  DRY-RUN: $(format_cmd bash "$REPO_ROOT/scripts/update.sh" --dry-run --foundations-only)"
    bash "$REPO_ROOT/scripts/update.sh" --dry-run --foundations-only
    return 0
  fi
  bash "$REPO_ROOT/scripts/update.sh" --foundations-only
}

should_run_post_install_doctor() {
  if [ "$NO_DOCTOR" = "1" ]; then
    return 1
  fi
  if [ "$PLATFORM" != "codex" ]; then
    return 1
  fi
  if [ "$LITE" = "1" ]; then
    return 0
  fi
  [ "$THEME" = "all" ] || [ "$THEME" = "builder" ]
}

run_post_install_doctor() {
  should_run_post_install_doctor || return 0

  local profile="operational"
  if [ "$LITE" = "1" ]; then
    profile="lite"
  elif [ "$THEME" = "builder" ]; then
    profile="builder"
  fi

  echo
  echo "  → Post-install doctor"
  local cmd=(node "$REPO_ROOT/scripts/doctor.mjs" "--target=$TARGET_ABS" "--platform=codex" "--profile=$profile")
  if [ "$DRY_RUN" = "1" ]; then
    echo "  DRY-RUN: $(format_cmd "${cmd[@]}")"
    return 0
  fi
  "${cmd[@]}"
}

run_builder_init() {
  if [ "$VS_CODE_COPILOT" = "1" ]; then
    run_init "harness-builder-$EMIT_PLATFORM" "init.mjs" --vscode-only
    return 0
  fi
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
    if [ "$LITE" != "1" ] && [ "$VS_CODE_COPILOT" != "1" ]; then
      run_init "harness-floor-$EMIT_PLATFORM" "init.mjs"
      if [ "$EMIT_PLATFORM" = "codex" ]; then
        run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs" --no-instrument
      elif [ "$EMIT_PLATFORM" = "gemini" ]; then
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
    elif [ "$EMIT_PLATFORM" = "gemini" ]; then
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs" --no-instrument
    else
      run_init "harness-thrift-$EMIT_PLATFORM" "install.mjs"
    fi
    ;;
esac

if [ "$UPDATE_FOUNDATIONS" = "1" ]; then
  run_foundation_update
fi

run_post_install_doctor

print_install_summary() {
  local platform="$1"
  local theme="$2"
  local lite="$3"

  if [ "$lite" = "1" ]; then
    case "$platform" in
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
      vscode-copilot)
        echo "  - .github/copilot-instructions.md (VS Code instructions-only scaffold)"
        ;;
      gemini)
        echo "  - GEMINI.md, .gemini/skills/ (builder-only lite scaffold)"
        ;;
    esac
    return 0
  fi

  case "$platform:$theme" in
    cursor:all)
      echo "  - .cursor/rules/, .cursor/agents/, .visual-qa.json, .agent-all.json, .thrift.json"
      ;;
    cursor:builder)
      echo "  - .cursor/rules/, .cursor/agents/"
      ;;
    cursor:floor)
      echo "  - .visual-qa.json, .agent-all.json"
      ;;
    cursor:thrift)
      echo "  - .thrift.json, .cursor/rules/"
      ;;
    copilot:all)
      echo "  - .github/copilot-instructions.md, .github/instructions/, .github/hooks/, .visual-qa.json, .agent-all.json, .thrift.json"
      ;;
    copilot:builder)
      echo "  - .github/copilot-instructions.md, .github/instructions/"
      ;;
    copilot:floor)
      echo "  - .visual-qa.json, .agent-all.json"
      ;;
    copilot:thrift)
      echo "  - .thrift.json, .github/hooks/"
      ;;
    vscode-copilot:all|vscode-copilot:builder)
      echo "  - .github/copilot-instructions.md (VS Code instructions-only scaffold)"
      ;;
    codex:all)
      echo "  - AGENTS.md, .codex/skills/, .codex/hooks/, .visual-qa.json, .agent-all.json, .thrift.json"
      echo "  - Note: Codex config snippets were printed to stdout; merge approved snippets into ~/.codex/config.toml"
      ;;
    codex:builder)
      echo "  - AGENTS.md, .codex/skills/, .codex/hooks/agent-policy-hook.mjs, docs/tasks/"
      echo "  - Note: codex-config.toml policy-hook snippet was printed to stdout; merge into ~/.codex/config.toml"
      ;;
    codex:floor)
      echo "  - .visual-qa.json, .agent-all.json, .codex/skills/{agent-all-codex,visual-qa-codex,visual-qa-page}/"
      echo "  - Note: Playwright MCP snippet and Codex floor guidance were printed to stdout for manual merge"
      ;;
    codex:thrift)
      echo "  - .thrift.json, .codex/hooks/thrift-*.toml"
      echo "  - Note: install-platform uses --no-instrument for Codex thrift; merge hook snippets manually after approval"
      ;;
    gemini:all)
      echo "  - GEMINI.md, .gemini/skills/, .visual-qa.json, .agent-all.json, .thrift.json"
      echo "  - Note: gemini-settings.json snippet was printed to stdout; merge into ~/.gemini/settings.json"
      ;;
    gemini:builder)
      echo "  - GEMINI.md, .gemini/skills/"
      ;;
    gemini:floor)
      echo "  - .visual-qa.json, .agent-all.json"
      echo "  - Note: Gemini floor settings snippet was printed to stdout for manual merge"
      ;;
    gemini:thrift)
      echo "  - .thrift.json"
      echo "  - Note: Gemini thrift settings snippet was printed to stdout for manual merge"
      ;;
  esac
}

echo
if [ "$DRY_RUN" = "1" ]; then
  echo "DRY-RUN complete. No files were written. Planned artifacts:"
else
  echo "Done. Inspect the target project for the new files:"
fi
print_install_summary "$PLATFORM" "$THEME" "$LITE"
if [ "$DRY_RUN" = "1" ]; then
  exit 0
fi
if [ "$LITE" = "1" ]; then
  exit 0
fi

if [ "$PLATFORM" = "vscode-copilot" ]; then
  echo
  echo "VS Code Copilot reads .github/copilot-instructions.md natively."
  echo "Installed instructions-only; Copilot CLI hooks, floor configs, and thrift configs were skipped."
fi
