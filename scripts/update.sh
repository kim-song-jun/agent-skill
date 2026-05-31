#!/usr/bin/env bash
# Update agent-skill in place — pulls latest from origin, syncs vendored
# libs, and re-runs install-all.sh so all your installed plugins move to
# the newest commit on the active branch.
#
# Usage (from anywhere — script self-locates the repo root):
#   bash <(curl -fsSL https://raw.githubusercontent.com/kim-song-jun/agent-skill/main/scripts/update.sh)
# Or, if you already cloned:
#   bash scripts/update.sh                 # update all 5 Claude Code essentials
#   bash scripts/update.sh --all           # all 17 plugins (CLI siblings included)
#   bash scripts/update.sh --cli=codex     # one platform's full plugin set
#   bash scripts/update.sh --cli=cursor    # one platform's full plugin set
#   bash scripts/update.sh --dry-run       # print the plan; change nothing
#
# Idempotent — re-runnable any time. Exit 0 = success.

set -euo pipefail

DRY_RUN=0
PASSTHROUGH=()
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      PASSTHROUGH+=("$arg")
      ;;
    --all|--cli=codex|--cli=copilot|--cli=gemini|--cli=cursor|--claude-code)
      PASSTHROUGH+=("$arg")
      ;;
    *)
      PASSTHROUGH+=("$arg")
      ;;
  esac
done

# Resolve repo root: prefer the directory the script lives in (when run
# from a local clone); fall back to a temp clone (when piped from curl).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "→ foundation update plan"
if [ -d "$REPO_ROOT/.git" ]; then
  echo "  - update local clone at $REPO_ROOT with git pull --ff-only"
else
  echo "  - clone agent-skill into a temporary directory"
fi
echo "  - verify vendored libs match canonical sources"
echo "  - refresh agent-skill marketplace cache"
echo "  - force-update already-installed Claude Code foundation plugins"
echo "  - install any missing selected platform plugins through install-all.sh"
if [ "${#PASSTHROUGH[@]}" -gt 0 ]; then
  echo "  - forward install/platform flags: ${PASSTHROUGH[*]}"
else
  echo "  - forward install/platform flags: (none)"
fi
echo "  - no global CLI config files are patched by this script"

if [ "$DRY_RUN" = "1" ]; then
  echo "Dry run requested; no git pull, marketplace update, uninstall, or install command will run."
  exit 0
fi

if [ ! -d "$REPO_ROOT/.git" ]; then
  # Piped-from-curl mode: clone fresh into a temp dir.
  TMP_CLONE="$(mktemp -d -t agent-skill-update-XXXXXX)"
  echo "→ cloning agent-skill into $TMP_CLONE …"
  git clone --depth 1 https://github.com/kim-song-jun/agent-skill "$TMP_CLONE" >/dev/null 2>&1
  REPO_ROOT="$TMP_CLONE"
else
  echo "→ updating local clone at $REPO_ROOT …"
  git -C "$REPO_ROOT" pull --ff-only origin "$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)" || {
    echo "  pull failed — local clone has unpushed changes or diverged history."
    echo "  resolve manually, then re-run."
    exit 1
  }
fi

echo "→ verifying vendored libs match canonical sources …"
node "$REPO_ROOT/scripts/sync-lib.mjs" --check

echo "→ refreshing claude marketplace cache for agent-skill …"
claude plugin marketplace update agent-skill 2>&1 | tail -1 || true

# `claude plugin install` is idempotent — if a plugin is already at any
# version, it won't fetch the latest commit. To actually pull updates we
# must uninstall first, then install. Skip uninstall for plugins that
# weren't already installed (treat update as install).
MARKETPLACE="agent-skill"
PLUGINS=(harness-builder harness-floor harness-thrift harness-explore harness-debug)

INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"
echo "→ force-updating already-installed agent-skill plugins (uninstall + install)…"
for p in "${PLUGINS[@]}"; do
  key="${p}@${MARKETPLACE}"
  if [ -f "$INSTALLED_JSON" ] && grep -q "\"${key}\"" "$INSTALLED_JSON" 2>/dev/null; then
    claude plugin uninstall "$key" >/dev/null 2>&1 || true
    if claude plugin install "$key" >/dev/null 2>&1; then
      echo "  ✓ $p"
    else
      echo "  ✗ $p (install failed — check 'claude plugin install ${key}' output)"
    fi
  fi
done

if [ "${#PASSTHROUGH[@]}" -gt 0 ]; then
  echo "→ installing any missing plugins via install-all.sh ${PASSTHROUGH[*]} …"
  exec bash "$REPO_ROOT/scripts/install-all.sh" "${PASSTHROUGH[@]}"
else
  echo "→ installing any missing plugins via install-all.sh (none) …"
  exec bash "$REPO_ROOT/scripts/install-all.sh"
fi
