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
#   bash scripts/update.sh --cli=cursor    # one platform's full plugin set
#
# Idempotent — re-runnable any time. Exit 0 = success.

set -euo pipefail

# Resolve repo root: prefer the directory the script lives in (when run
# from a local clone); fall back to a temp clone (when piped from curl).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

echo "→ re-installing plugins via install-all.sh $* …"
exec bash "$REPO_ROOT/scripts/install-all.sh" "$@"
