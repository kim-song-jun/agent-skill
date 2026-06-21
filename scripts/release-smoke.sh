#!/usr/bin/env bash
# release-smoke.sh - release gate for the Claude Code native plugins and
# Claude/Codex project renderers. Defaults to the full suite; use --fast for the
# focused release-contract subset used by CI and local preflight checks.
#
# Usage:
#   ./scripts/release-smoke.sh          # focused contracts + full test suite
#   ./scripts/release-smoke.sh --fast   # focused contracts only
#   ./scripts/release-smoke.sh --full   # explicit full mode
#   ./scripts/release-smoke.sh --fast --with-live-cli
#                                      # also probe installed Claude/Codex CLIs

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE="full"
WITH_LIVE_CLI=0

for arg in "$@"; do
  case "$arg" in
    --fast) MODE="fast" ;;
    --full) MODE="full" ;;
    --with-live-cli) WITH_LIVE_CLI=1 ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
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

if [ "$WITH_LIVE_CLI" -eq 1 ]; then
  run_step "live Claude/Codex CLI probes" bash -c '
    set -euo pipefail
    probe_cli() {
      local name="$1"
      if ! command -v "$name" >/dev/null 2>&1; then
        echo "Missing required live CLI: $name" >&2
        return 1
      fi
      local version
      version="$("$name" --version 2>&1)"
      echo "$name: $version"
    }
    probe_codex_exec_surface() {
      local help
      help="$(codex exec --help 2>&1)"
      if ! grep -Eq "Usage: codex exec .*\\[PROMPT\\]" <<<"$help"; then
        echo "Codex exec prompt interface changed; expected positional [PROMPT] support." >&2
        return 1
      fi
      echo "codex exec: positional prompt interface"
    }
    probe_claude_plugin_surface() {
      local plugin_help marketplace_help install_help
      plugin_help="$(claude plugin --help 2>&1)"
      if ! grep -Eq "Usage: claude plugin\\|plugins" <<<"$plugin_help" \
        || ! grep -Eq "\\bmarketplace\\b" <<<"$plugin_help" \
        || ! grep -Eq "install\\|i" <<<"$plugin_help"; then
        echo "Claude plugin command surface changed; expected plugin marketplace and install commands." >&2
        return 1
      fi
      marketplace_help="$(claude plugin marketplace --help 2>&1)"
      if ! grep -Eq "Usage: claude plugin marketplace" <<<"$marketplace_help" \
        || ! grep -Eq "\\badd\\b.*<source>" <<<"$marketplace_help" \
        || ! grep -Eq "\\bupdate\\b.*\\[name\\]" <<<"$marketplace_help"; then
        echo "Claude marketplace command surface changed; expected add/update commands." >&2
        return 1
      fi
      install_help="$(claude plugin install --help 2>&1)"
      if ! grep -Eq "Usage: claude plugin install\\|i .*<plugin>" <<<"$install_help" \
        || ! grep -Eq -- "--scope <scope>" <<<"$install_help"; then
        echo "Claude plugin install command surface changed; expected plugin argument and scope option." >&2
        return 1
      fi
      echo "claude plugin: marketplace/install surface"
    }
    probe_cli claude
    probe_cli codex
    probe_claude_plugin_surface
    probe_codex_exec_surface
  '
fi

run_step "release readiness audit" \
  node "$REPO_ROOT/scripts/release-audit.mjs"

run_step "GitHub governance check" \
  node "$REPO_ROOT/scripts/github-governance-check.mjs"

run_step "docs structure check" \
  node "$REPO_ROOT/scripts/docs-structure-check.mjs"

run_step "release provenance manifest smoke" \
  node "$REPO_ROOT/scripts/release-provenance.mjs" --no-write --json

run_step "fresh release fixtures" \
  node "$REPO_ROOT/scripts/release-fixture-smoke.mjs"

run_step "skill utility eval smoke" \
  node "$REPO_ROOT/scripts/skill-eval.mjs" --smoke --no-write --json

run_step "Claude marketplace dry-run" \
  bash "$REPO_ROOT/scripts/install-all.sh" --dry-run --claude-code

run_step "Codex marketplace dry-run" \
  bash "$REPO_ROOT/scripts/install-all.sh" --dry-run --cli=codex

run_step "Codex native plugin updater dry-run" \
  bash "$REPO_ROOT/scripts/update-codex-plugins.sh" --dry-run

run_step "focused release contracts" \
  node --test \
    tests/lib/agent-init-dry-run-contract.test.mjs \
    tests/lib/claude-native-release-contract.test.mjs \
    tests/lib/doctor-script.test.mjs \
    tests/lib/harness-cleaner.test.mjs \
    tests/lib/release-audit.test.mjs \
    tests/lib/release-candidate.test.mjs \
    tests/lib/release-command-surface.test.mjs \
    tests/lib/release-install-scripts.test.mjs \
    tests/lib/update-script-contract.test.mjs \
    tests/lib/codex-native-update-script.test.mjs \
    tests/lib/copilot/agent-all-runtime-debt.test.mjs \
    tests/lib/release-doc-contract.test.mjs \
    tests/lib/skill-eval.test.mjs \
    tests/lib/github-governance.test.mjs \
    tests/lib/release-provenance.test.mjs \
    tests/lib/cross-platform-manifest.test.mjs \
    tests/lib/codex-current-hook-schema.test.mjs \
    tests/lib/codex-install-hook.test.mjs \
    tests/lib/debug-artifacts.test.mjs \
    tests/lib/visual-qa-vendored-libs.test.mjs \
    tests/agent-all/lib/generated-policy-hook.test.mjs \
    tests/agent-all/lib/changed-file-classifier.test.mjs \
    tests/agent-all/lib/gate-plan.test.mjs \
    tests/agent-all/lib/orchestration/orchestration-planner.test.mjs \
    tests/agent-all/interactions/schema-renderer.test.mjs \
    tests/agent-all/interactions/non-tty-log.test.mjs \
    tests/agent-all/policy/coordinator-audit-validator.test.mjs \
    tests/agent-all/policy/audit-token-ssot.test.mjs \
    tests/agent-all/policy/advisory-hook-error-handling.test.mjs \
    tests/agent-all/policy/policy-hook-error-handling.test.mjs \
    tests/agent-all/policy/shell-tokenizer-continuation.test.mjs \
    tests/agent-all/policy/hook-router-coordinator.test.mjs \
    tests/agent-all/policy/install.test.mjs \
    tests/lib/agent-all-codex.test.mjs \
    tests/lib/agent-all-codex-dispatch.test.mjs \
    tests/lib/visual-qa-codex-dispatch.test.mjs \
    tests/lib/harness-builder-cli-init.test.mjs \
    tests/lib/harness-floor-init.test.mjs \
    tests/lib/thrift-codex.test.mjs \
    tests/lib/thrift-codex-hooks.test.mjs \
    tests/lib/agent-all-codex-adversarial.test.mjs \
    tests/lib/agent-all-codex-checkpoint.test.mjs

run_step "vendored libs" node scripts/sync-lib.mjs --check
run_step "support matrix" node scripts/generate-support-matrix.mjs --check

if [ "$MODE" = "full" ]; then
  mapfile -t TEST_FILES < <(cd "$REPO_ROOT" && find tests -name '*.test.mjs' | sort)
  run_step "full test suite" node --test "${TEST_FILES[@]}"
fi

echo
echo "release smoke complete"
