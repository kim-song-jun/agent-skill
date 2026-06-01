#!/usr/bin/env bash
# release-smoke.sh - release gate for the Claude Code native plugins and
# Codex CLI project renderer. Defaults to the full suite; use --fast for the
# focused release-contract subset used by CI and local preflight checks.
#
# Usage:
#   ./scripts/release-smoke.sh          # focused contracts + full test suite
#   ./scripts/release-smoke.sh --fast   # focused contracts only
#   ./scripts/release-smoke.sh --full   # explicit full mode

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="full"

for arg in "$@"; do
  case "$arg" in
    --fast) MODE="fast" ;;
    --full) MODE="full" ;;
    -h|--help)
      sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

run_step() {
  local label="$1"
  shift
  echo
  echo "==> release smoke: $label"
  (cd "$REPO_ROOT" && "$@")
}

run_step "Claude marketplace dry-run" \
  bash "$REPO_ROOT/scripts/install-all.sh" --dry-run --claude-code

run_step "Codex marketplace dry-run" \
  bash "$REPO_ROOT/scripts/install-all.sh" --dry-run --cli=codex

run_step "focused release contracts" \
  node --test \
    tests/lib/claude-native-release-contract.test.mjs \
    tests/lib/release-install-scripts.test.mjs \
    tests/lib/release-doc-contract.test.mjs \
    tests/lib/cross-platform-manifest.test.mjs \
    tests/lib/codex-current-hook-schema.test.mjs \
    tests/lib/agent-all-codex-dispatch.test.mjs \
    tests/lib/visual-qa-codex-dispatch.test.mjs \
    tests/lib/harness-builder-cli-init.test.mjs \
    tests/lib/harness-floor-init.test.mjs \
    tests/lib/thrift-codex.test.mjs

run_step "vendored libs" node scripts/sync-lib.mjs --check

if [ "$MODE" = "full" ]; then
  mapfile -t TEST_FILES < <(cd "$REPO_ROOT" && find tests -name '*.test.mjs' | sort)
  run_step "full test suite" node --test "${TEST_FILES[@]}"
fi

echo
echo "release smoke complete"
